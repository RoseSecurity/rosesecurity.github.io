---
layout: post
title:  "Terraform Drift Detection Powered by GitHub Actions"
tags: terraform iac infrastructure devops engineering
---

```plaintext
TL;DR
Build a _zero-cost_ drift detection system using GitHub Actions and Terraform's native exit codes. This workflow automatically discovers all Terraform root modules, runs daily drift checks, and creates GitHub issues when changes are detected.
```

## The Problem

Infrastructure drift happens when your cloud resources diverge from your Terraform state. Manual changes, console modifications, or other automation can silently alter infrastructure, leaving some serious blind spots and inconsistencies. Traditional drift detection generally involves complex, custom, or expensive solutions. [RIP `driftctl`](https://github.com/snyk/driftctl#this-project-is-now-in-maintenance-mode-we-cannot-promise-to-review-contributions-please-feel-free-to-fork-the-project-to-apply-any-changes-you-might-want-to-make)

## The Simplicity of GitHub Actions

I love GitHub Actions. They offer a native, cost-effective platform for automated drift detection. By leveraging Terraform's built-in exit codes and GitHub's issue tracking, we can build a robust drift detection system using only native features with no external services required. This approach works well for small-to-medium deployments. Larger-scale production use requires additional considerations like multi-account support, sensitive data sanitization, and automated remediation (I'll talk about that below).

## The Workflow

### Triggers and Permissions

The workflow runs on a daily schedule and supports manual execution via `workflow_dispatch`. We configure OIDC (`id-token: write`) for secure, keyless AWS authentication and grant permissions to create issues and pull requests for drift tracking.

```yaml
name: Terraform Drift Detection

# We can also add some fancy logic to extract this from a Dockerfile
# or versions.tf so we don't have to continually monitor and bump this.
env:
  TF_VERSION: 1.X.X

on:
  workflow_dispatch:
  schedule:
    - cron: "00 6 * * *" # Every day at 06:00 UTC

permissions:
  # This is required for requesting the JWT and opening issues
  id-token: write
  contents: read
  pull-requests: write
  issues: write
```

### Finding Root Modules

This job dynamically discovers all Terraform root modules in the repository by searching for `.tf` files while excluding module subdirectories and Terraform's cache. The `find` command output is transformed into a JSON array using `jq`, enabling parallel drift detection across multiple environments via matrix strategy. This may differ depending on your Terraform structure, but the general idea is to create a matrix of Terraform root modules that we can run `terraform plan` against.

```yaml
jobs:
  find-terraform-envs:
    name: 'Find Terraform Directories'
    runs-on: ubuntu-latest
    outputs:
      terraform-envs: ${{ steps.fetch-environments.outputs.dirs }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4.2.2

      - name: Fetch Environments
        id: fetch-environments
        run: |
          # Create a matrix of Terraform root modules
          DIRS=$(find . -type f -name '*.tf' -not -path "*/modules/*" -not -path "*/.terraform/*" -exec dirname {} \; | sort -u | jq -R -s -c 'split("\n")[:-1]')
          echo "dirs=$DIRS" >> "$GITHUB_OUTPUT"
          echo "Found environments: $DIRS"
```

### Credential Configuration and Setup

The drift detection job runs in parallel for each discovered Terraform directory using a matrix strategy with `fail-fast: false` to ensure one environment's failure doesn't block others. AWS credentials are configured via OIDC role assumption (no static keys), and Terraform is initialized with `terraform_wrapper: false` to ensure clean exit code propagation. The OIDC in AWS takes some additional setup for this to work, but it's the recommended approach for secure, keyless authentication.

```yaml
  drift-detection:
    name: 'Drift Detection'
    runs-on: ubuntu-latest
    needs: find-terraform-envs
    if: needs.find-terraform-envs.outputs.terraform-envs != '[]'
    strategy:
      fail-fast: false
      matrix:
        tf_dir: ${{ fromJson(needs.find-terraform-envs.outputs.terraform-envs) }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4.2.2

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4.1.0
        with:
          aws-region: us-east-1
          role-to-assume: ${{ secrets.AWS_ROLE }}
          role-session-name: Drift_Detection

      - name: Set up Terraform
        uses: hashicorp/setup-terraform@v3.1.2
        with:
          terraform_version: ${{ env.TF_VERSION }}
          terraform_wrapper: false

      - name: Terraform Init
        working-directory: ${{ matrix.tf_dir }}
        run: terraform init -input=false
```

### Detecting Drift

This is the core drift detection mechanism. The `terraform plan -detailed-exitcode` returns exit codes: `0` (no changes), `1` (error), or `2` (drift detected). We capture the actual Terraform exit code using `${PIPESTATUS[0]}` rather than `$?`, which would only return `sed`'s exit code. The plan output is filtered and saved for issue creation.

**Technical Note:** We use `set +e` to prevent immediate failure, `-input=false` to prevent hanging on interactive prompts, and `-lock-timeout=5m` to handle state locks gracefully.

```yaml
      - name: Terraform Drift Detection Plan
        id: plan
        working-directory: ${{ matrix.tf_dir }}
        shell: bash
        run: |
          set +e # Disable exit on error for this step
          terraform plan -detailed-exitcode -compact-warnings -no-color -input=false -lock-timeout=5m 2>&1 | sed -n '/Terraform will perform the following actions:/,$p' > plan_output.txt
          EXIT_CODE=${PIPESTATUS[0]}
          echo "exit_code=$EXIT_CODE" >> "$GITHUB_OUTPUT"
          echo "EXIT_CODE=$EXIT_CODE" >> "$GITHUB_ENV"

          # Show the plan output
          cat plan_output.txt

          # Set drift detected flag
          if [ $EXIT_CODE -eq 2 ]; then
            echo "drift_detected=true" >> "$GITHUB_OUTPUT"
            echo "Drift detected in ${{ matrix.tf_dir }}"
          elif [ $EXIT_CODE -eq 1 ]; then
            echo "plan_failed=true" >> "$GITHUB_OUTPUT"
            echo "Plan failed in ${{ matrix.tf_dir }}"
          else
            echo "No drift detected in ${{ matrix.tf_dir }}"
          fi
```

### Creating and Updating GitHub Issues

When drift is detected (exit code 2), this step uses the GitHub API via `actions/github-script` to create trackable issues. It reads the plan output, searches for existing open issues for the specific directory, and either updates the existing issue with a new comment or creates a fresh issue with appropriate labels. This ensures each Terraform directory has a single tracking issue that accumulates drift detections over time, providing an audit trail and preventing issue spam.

**Security Note:** Terraform plan output may contain sensitive information such as resource IDs, internal IP addresses, or computed values. If your repository is public or your plan output includes sensitive data, consider implementing sanitization logic before creating issues, or restrict this workflow to private repositories with limited access. You may also want to use GitHub Actions secrets masking or filter the plan output to redact sensitive patterns.

```yaml
      - name: Create or Update Issue on Drift Detection
        if: steps.plan.outputs.drift_detected == 'true'
        uses: actions/github-script@v7.0.1
        with:
          script: |
            const fs = require('fs');
            const path = require('path');
            let planOutput = '';
            try {
              planOutput = fs.readFileSync(path.join('${{ matrix.tf_dir }}', 'plan_output.txt'), 'utf8');
            } catch (error) {
              planOutput = 'Could not read plan output';
            }

            const title = `Terraform Drift Detected in ${context.repo.repo}: ${{ matrix.tf_dir }}`;
            const driftBody = `## Terraform Drift Detected
            **Directory:** \`${{ matrix.tf_dir }}\`
            **Detection Time:** ${new Date().toISOString()}
            **Workflow:** [${context.runId}](${context.payload.repository.html_url}/actions/runs/${context.runId})
            <details>
            <summary>Plan Output</summary>

            \`\`\`
            ${planOutput}
            \`\`\`

            </details>
            Please review the changes and determine if they should be applied or if the Terraform configuration needs to be updated.`;

            // Search for existing open drift issue for this directory
            const issues = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open',
              labels: ['drift-detection']
            });

            const existingIssue = issues.data.find(issue =>
              issue.title.includes('Terraform Drift Detected') &&
              issue.title.includes('${{ matrix.tf_dir }}')
            );

            if (existingIssue) {
              // Update existing issue with new drift info
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: existingIssue.number,
                body: `## New Drift Detected\n\n${driftBody}`
              });

              console.log(`Updated existing issue #${existingIssue.number}`);
            } else {
              // Create new issue
              const newIssue = await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: title,
                body: driftBody,
                labels: ['terraform', 'drift-detection', 'needs-review']
              });

              console.log(`Created new issue #${newIssue.data.number}`);
            }
```

## Key Benefits

This approach provides several engineering advantages:

- **Zero External Dependencies**: No third-party SaaS tools or agents required
- **Native Exit Code Logic**: Leverages Terraform's `detailed-exitcode` for precise drift detection
- **Parallel Execution**: Matrix strategy enables concurrent checks across multiple environments
- **Audit Trail**: GitHub issues provide timestamped drift history and workflow run links
- **Secure Authentication**: OIDC eliminates static credential management
- **Cost Effective**: Runs on GitHub Actions free tier for small to medium usage (note that larger deployments with many Terraform directories may exceed free tier limits)

The workflow scales horizontally as you add Terraform directories and provides immediate visibility into infrastructure changes through your existing issue tracking system.

## Considerations for Production Use

While this workflow provides solid drift detection, you may want to enhance it for production environments:

- **Multi-Account Support**: This example uses a single AWS role. For multi-account setups, consider using a matrix strategy with account-specific roles or dynamic role selection based on directory structure
- **Sensitive Data Handling**: Implement plan output sanitization if your infrastructure includes secrets or sensitive configuration
- **Issue Lifecycle Management**: Add automation to close issues when drift is resolved or implement a reconciliation step to verify fixes
- **State Lock Handling**: The `-lock-timeout=5m` provides basic protection, but consider monitoring for persistent lock issues that may indicate state corruption or concurrent modifications
- **Error Notification**: Consider adding Slack/email notifications for plan failures in addition to GitHub issues

---

If you liked (or hated) this blog, feel free to check out my [GitHub](https://github.com/RoseSecurity)!
