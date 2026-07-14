---
layout: post
title:  "Building a Monorepository of Terraform Modules on GitLab"
tags: automation terraform gitlab infra
---

> It is such a terribly long time since I last wrote to you — almost two years but I know you’ll excuse me because you understand how I am, stubborn and realistic; and I thought there was no sense to writing with all these AI companies unethically stealing all of our intellectual property." -Richard Feynman

Sorry for the silence. I have had my head down on new and exciting tech adventures each day, but I wanted to share something cool and hopefully useful that I have been prototyping. I have not seen many articles on this approach, so maybe it will be both innovative and practical. In a previous role, we were leveraging GitLab's internal Terraform registry, which was handy. It made it easy to follow best practices like testing and versioning modules, and it helped us provide self-service infrastructure to other teams with best practices and security baked in. Overall, it was a great experience with a few pain points. Each Terraform module had its own repository, which is super cool, but that starts to introduce friction when you only have 5 people on a team maintaining infrastructure and tons of modules for an app that gets 16 million users each day. I digress. Individual repositories can still be powerful. For example, Cloud Posse has tons of Terraform module and component repositories across their GitHub org. Each has workflows, example code, extensive automation, and tests that even run in a test AWS account. When an approved maintainer comments on an open source contribution PR with `/terratest`, a runner uses Terratest to deploy real infra from the codebase and make sure the module actually works. While this is pretty nice, I thought I could consolidate a lot of the pros into a monorepo and start eliminating the pain points. This blog details how I structured and built automation to provide self-service Terraform modules to the org.

## Scaffolding

Maybe I talk about scaffolding too much, but I truly believe it lays the foundation for a successful repository. There's always been a soft spot in my heart for developer experience, so I usually add a `Brewfile` with the dependencies needed to work in the repo (**NOTE:** In the future, I might look into `nixpkgs` for this use case. Declarative configs ftw). Anyway, I also include the basic housekeeping items like issue and PR/MR templates, Makefiles, Renovate configs, security contacts, and the classics: `.gitattributes`, `.gitignore`, and `.editorconfig`.

Since these are Terraform modules, I also run Checkov across the codebase, so you might find a `.checkov.yaml` sprinkled next to a `.copywrite.hcl`. Other than that, I keep the pre-commit hooks pretty light. The main pieces cover general file hygiene, Terraform linting, documentation generation, security scanning with Checkov, and some secrets scanning. I also run Copywrite because it makes me feel special that I can add copyright headers to some code.

```yaml
# See https://pre-commit.com for more information
# See https://pre-commit.com/hooks.html for more hooks
repos:
  -   repo: https://github.com/pre-commit/pre-commit-hooks
      rev: v5.0.0
      hooks:
      -   id: end-of-file-fixer
      -   id: check-merge-conflict
      -   id: trailing-whitespace
          args: [--markdown-linebreak-ext=md]
      -   id: check-shebang-scripts-are-executable
      # YAML
      -   id: check-yaml
      # Cross platform
      - id: check-case-conflict # checks for files that would conflict in case-insensitive filesystems.
      - id: mixed-line-ending # replaces or checks mixed line ending.
        args: [--fix=lf]

  - repo: https://github.com/antonbabenko/pre-commit-terraform
    # Ensure the PRE_COMMIT_TERRAFORM_VERSION value is the same in .gitlab-ci.yml
    rev: v1.105.0 # Get the latest from: https://github.com/antonbabenko/pre-commit-terraform/releases
    hooks:
      - id: terraform_fmt
      - id: terraform_docs
        args: ["--args=--lockfile=false"]
      - id: terraform_tflint
      - id: terraform_checkov
        args:
          - --args=--framework=terraform
          - --args=--soft-fail
          - --args=--config-file=__GIT_WORKING_DIR__/.checkov.yaml
          - --args=--skip-path=__GIT_WORKING_DIR__/.cache/pre-commit

  - repo: https://github.com/bridgecrewio/checkov.git
    rev: 3.2.524
    hooks:
      - id: checkov_secrets
        args: [--directory, ., --framework, secrets, --config-file, .checkov.yaml, --skip-path, .cache/pre-commit]
        pass_filenames: false

  - repo: https://github.com/hashicorp/copywrite
    rev: v0.25.3
    hooks:
      - id: add-headers
```

> **NOTE:** These pre-commit hooks are typically run again in CI via: `pre-commit run --all-files --show-diff-on-failure` to ensure standards are met

## Repository Structure

The repository structure is pretty straightforward. Each module contains the core Terraform logic, a tests directory with native `terraform test` coverage, and a CHANGELOG. For my use case, I've been using [Changie](https://changie.dev/) for automated changelog generation, but this is more of an add-on than a requirement. It just makes it easier to keep track of changes as the repository grows over time.

```console
├── Brewfile
├── Makefile
├── Other stuff...
├── modules
│   ├── aws
│   │   ├── account
│   │   │   ├── CHANGELOG.md
│   │   │   ├── main.tf
│   │   │   ├── outputs.tf
│   │   │   ├── README.md
│   │   │   ├── tests
│   │   │   │   └── basic.tftest.hcl
│   │   │   ├── variables.tf
└── └──     │   └── versions.tf
```

## GitLab CI Pipelines

The GitLab CI pipelines consist of detection, validation, and dispatch stages. The goal is to keep the feedback loop tight while still enforcing the basics: pre-commit hooks pass in CI, formatting and code quality standards are followed, and security checks catch obvious issues before anything gets merged. We also leverage secrets scanning to make sure sensitive information does not get committed to version control. After those checks pass, Terraform tests run for the changed modules, and once the changes land on `main`, the module gets published with a version tag.

> **NOTE:** I prefer defining versions at the top level of my GitLab CI pipelines. It makes upgrades and version bumps easier, and it keeps versions in one place instead of scattered throughout the workflow files.

The root pipeline is mostly orchestration. It defines the stages, pins the container versions used by the jobs, limits pipeline execution to merge requests from the same project and pushes to the default branch, and includes the smaller workflow files that do the actual work. I like this pattern because the main `.gitlab-ci.yml` stays readable and the implementation details can live under `.gitlab/ci/`.

```yaml
# Root GitLab CI pipeline definition for the Terraform modules repository.
stages:
  - detect
  - validate
  - dispatch

default:
  timeout: 30 minutes
  interruptible: true

variables:
  TF_VERSION: "1.15.5"
  TF_IMAGE: "hashicorp/terraform:$TF_VERSION"
  ALPINE_GIT_VERSION: "2.52.0"
  CURL_IMAGE_VERSION: "8.21.0"
  CURL_IMAGE: "curlimages/curl:$CURL_IMAGE_VERSION"
  PRE_COMMIT_TERRAFORM_VERSION: "1.105.0"

workflow:
  name: '$CI_PIPELINE_SCHEDULE_DESCRIPTION'
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event" && $CI_MERGE_REQUEST_SOURCE_PROJECT_ID == $CI_PROJECT_ID'
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'

include:
  - local: .gitlab/ci/detect/*.gitlab-ci.yml
  - local: .gitlab/ci/validate/*.gitlab-ci.yml
  - local: .gitlab/ci/dispatch/*.gitlab-ci.yml
```

### Change Detection

The change detection job builds the list of Terraform modules that were touched in the current pipeline. For merge requests, it compares the branch against the target branch. For default branch pushes, it compares the current commit against the previous commit and falls back to the first commit if GitLab does not provide a usable base SHA. From there, it walks changed files under `modules/`, finds the owning module by looking for `.changie.yaml`, and writes a dotenv artifact that later jobs can consume.

The important piece is that this turns a monorepo into a smaller work queue. Instead of running every test and publishing logic against every module, the pipeline only focuses on modules that actually changed.

```yaml
# Detects changed Terraform modules for merge requests and main branch commits.
terraform:changes:
  stage: detect
  image:
    name: "alpine/git:$ALPINE_GIT_VERSION"
    entrypoint: [""]
  variables:
    GIT_DEPTH: "0"
    TERRAFORM_CHANGE_MATRIX_DIR: "terraform-change-matrix"
  script:
    - |
      set -eu

      mkdir -p "$TERRAFORM_CHANGE_MATRIX_DIR"

      if [ "$CI_PIPELINE_SOURCE" = "merge_request_event" ]; then
        git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
        BASE_SHA="$(git merge-base HEAD "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME")"
      else
        BASE_SHA="${CI_COMMIT_BEFORE_SHA:-}"
        if [ -z "$BASE_SHA" ] || [ "$BASE_SHA" = "0000000000000000000000000000000000000000" ]; then
          BASE_SHA="$(git rev-list --max-parents=0 HEAD)"
        fi
      fi

      changed_files="$(git diff --name-only "$BASE_SHA" "$CI_COMMIT_SHA" -- modules/ || true)"
      module_dirs="$(
        for changed_file in $changed_files; do
          module_dir="${changed_file%/*}"
          while [ "$module_dir" != "." ] && [ "$module_dir" != "modules" ]; do
            if [ -f "$module_dir/.changie.yaml" ]; then
              printf '%s\n' "$module_dir"
              break
            fi
            module_dir="${module_dir%/*}"
          done
        done | sort -u
      )"
      module_test_dirs="$(
        for module_dir in $module_dirs; do
          if [ -d "$module_dir/tests" ] && find "$module_dir/tests" -name '*.tftest.hcl' -print -quit | grep -q .; then
            printf '%s\n' "$module_dir"
          fi
        done
      )"

      {
        printf 'TF_CHANGED_MODULE_DIRS=%s\n' "$(printf '%s' "$module_dirs" | tr '\n' ' ')"
        printf 'TF_CHANGED_MODULE_TEST_DIRS=%s\n' "$(printf '%s' "$module_test_dirs" | tr '\n' ' ')"
        printf 'TF_CHANGED_MODULE_TEST_COUNT=%s\n' "$(printf '%s\n' "$module_test_dirs" | sed '/^$/d' | wc -l | tr -d ' ')"
      } > "$TERRAFORM_CHANGE_MATRIX_DIR/matrix.env"

      cat "$TERRAFORM_CHANGE_MATRIX_DIR/matrix.env"
  artifacts:
    when: always
    expire_in: 1 week
    reports:
      dotenv: terraform-change-matrix/matrix.env
    paths:
      - terraform-change-matrix/
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      changes:
        - modules/**/*
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
      changes:
        - modules/**/*
```

### Testing Modules

The test job consumes the dotenv artifact from change detection and only runs `terraform test` for changed modules that actually contain `.tftest.hcl` files. If no changed modules have tests, the job exits cleanly. This keeps CI from wasting time on empty test directories while still making native Terraform tests part of the normal merge request workflow.

```yaml
# Runs terraform test for changed Terraform modules that include test coverage.
terraform-test:
  stage: validate
  image:
    name: "$TF_IMAGE"
    entrypoint: [""]
  needs:
    - job: terraform:changes
      artifacts: true
  script:
    - |
      set -eu

      if [ "${TF_CHANGED_MODULE_TEST_COUNT:-0}" = "0" ]; then
        echo "No changed Terraform modules with tests detected."
        exit 0
      fi

      for module_dir in $TF_CHANGED_MODULE_TEST_DIRS; do
        echo "Running terraform test in $module_dir"
        (
          cd "$module_dir"
          terraform init -input=false
          terraform test
        )
      done
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      changes:
        - modules/**/*
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
      changes:
        - modules/**/*
```


## Publishing Modules

Publishing only runs on pushes to the default branch. It uses the changed module list from the detection job, reads the latest semantic version from each module's `CHANGELOG.md`, creates a module-specific Git tag, packages the module directory, and uploads it to GitLab's Terraform module registry. The tag format keeps each release tied back to its module path, which matters when multiple modules are released from the same repository.

After the module is published, it shows up in GitLab's Terraform module registry like any other module package.

![Terraform module registry](/assets/img/terraform-module-registry.png)

```yaml
terraform-module:publish:
  stage: dispatch
  image: "$CURL_IMAGE"
  needs:
    - job: terraform:changes
      artifacts: true
  script:
    - |
      set -eu

      if [ -z "${GITLAB_RELEASE_TOKEN:-}" ]; then
        echo "GITLAB_RELEASE_TOKEN is required to create module tags."
        exit 1
      fi

      if [ -z "${TF_CHANGED_MODULE_DIRS:-}" ]; then
        echo "No changed Terraform modules detected."
        exit 0
      fi

      for MODULE_DIR in $TF_CHANGED_MODULE_DIRS; do
        MODULE_VERSION="$(sed -nE 's/^## ([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' "$MODULE_DIR/CHANGELOG.md" | head -n 1)"
        if [ -z "$MODULE_VERSION" ]; then
          echo "Could not determine module version from $MODULE_DIR/CHANGELOG.md"
          exit 1
        fi

        MODULE_TAG="${MODULE_DIR}/v${MODULE_VERSION}"
        MODULE_SYSTEM="$(echo "$MODULE_DIR" | cut -d/ -f2)"
        MODULE_NAME="$(echo "$MODULE_DIR" | cut -d/ -f3- | tr '/' '-')"

        echo "Creating $MODULE_TAG"
        curl --fail-with-body --location --request POST \
          --header "PRIVATE-TOKEN: ${GITLAB_RELEASE_TOKEN}" \
          --form "tag_name=${MODULE_TAG}" \
          --form "ref=${CI_COMMIT_SHA}" \
          "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/repository/tags"

        tar -czf "/tmp/${MODULE_NAME}-${MODULE_SYSTEM}-${MODULE_VERSION}.tgz" \
          -C "$MODULE_DIR" \
          --exclude=.git \
          .

        PACKAGE_URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/terraform/modules/${MODULE_NAME}/${MODULE_SYSTEM}/${MODULE_VERSION}/file"

        echo "Publishing $MODULE_NAME/$MODULE_SYSTEM/$MODULE_VERSION"
        curl --fail-with-body --location \
          --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
          --upload-file "/tmp/${MODULE_NAME}-${MODULE_SYSTEM}-${MODULE_VERSION}.tgz" \
          "$PACKAGE_URL"
      done
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push" && $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
      changes:
        - modules/**/*
```

There are still a few rough edges, but so far, this solution has been what I need for a monorepo of Terraform modules that can be consumed by internal registry users and other teams. It's still a work in progress, but having a consolidated repository with versioning, testing, changelogs, and linting has been the right fit.

---

If you liked (or hated) this blog, feel free to check out my [GitHub](https://github.com/RoseSecurity)!
