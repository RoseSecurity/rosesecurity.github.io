---
layout: post
title:  "Implementing OPA with Terraform the Easy Way"
tags: compliance opa rego security infra
---

A few days ago, I was pleasantly surprised to discover that TFLint has a ruleset plugin for writing custom rules in Rego. For those who don't know, I tend to roll my own CI/CD pipelines, scanning, and most of the other pieces that make up a solid IaC experience. I've been _slightly_ envious of Terraform Cloud users with Sentinel and the Spacelift crowd who get policy enforcement out of the box.

Compliance as code has always been close to my heart. The ability to codify guardrails and enforce them consistently is one of the biggest advantages of treating infrastructure as software. The problem is that the traditional OPA workflow always intimidated me. Between building policy bundles, wiring `opa exec` into every plan, and learning Rego, the operational overhead outweighed the perceived benefit for me.

Fortunately, I already run TFLint through pre-commit hooks, have the language server integrated directly into Neovim, and didn't want to maintain a custom TFLint plugin just to enforce a handful of policies. With that in mind, here's my first iteration of implementing OPA with Terraform the easy way.

## Configuring the Plugin

If you follow the [installation documentation](https://github.com/terraform-linters/tflint-ruleset-opa#installation), the first steps to configuring the plugin are to add it to your `.tflint.hcl` and run `tflint --init`:


```hcl
plugin "opa" {
  enabled = true
  version = "0.11.0" # Subject to change (hopefully)
  source  = "github.com/terraform-linters/tflint-ruleset-opa"
}
```

Once this is done, you can create the directory where the policies will live:

```sh
mkdir -p .tflint.d/policies
```

> **NOTE:** `./.tflint.d/policies` and `~/.tflint.d/policies` are the default policy directories where the plugin searches, but you can specify this in the plugin block via `policy_dir` or use a remote policy bundle with `bundle_url`. Later in this blog, I talk about a third way using `TFLINT_OPA_POLICY_DIR`

With the plugin installed and the policy directory created, we can create our first policy for denying local exec provisioners.

## Writing the Policy

I'm not a big fan of `local-exec` provisioners. They run arbitrary shell commands on the machine executing Terraform (whether that's a CI runner, engineering workstation, etc.). Provisioners sidestep the provider/state model, have invisible plans to review, and are often a common vector for supply-chain attacks.

With that in mind, let's create a simple policy to deny `local-exec` provisioners:

```rego
package tflint

import rego.v1

provisioners := terraform.resources(
	"*",
	{"provisioner": {"__labels": ["type"], "command": "string"}},
	{"expand_mode": "none"},
)

deny_local_exec_provisioner contains issue if {
	some resource in provisioners
	some provisioner in resource.config.provisioner
	provisioner.labels[0] == "local-exec"

	issue := tflint.issue(
		sprintf(`local-exec provisioner is not allowed (on %s.%s)`, [resource.type, resource.name]),
		provisioner.decl_range,
	)
}
```

The policy identifies Terraform resources that contain provisioner blocks, checks whether the provisioner type is `local-exec`, and generates a linting error when one is found. The result is immediate feedback during development, rather than discovering the issue during code review or after it reaches a deployment pipeline. The cool part is that this same pattern can be used for enforcing required tags, mandating encryption settings, and whatever else your heart desires.

---

![tflint_lsp](/assets/img/tflint-lsp.png)

---

When run from the CLI, the output looks like:

```console
TFLint in terraform/environments/aws/data/fivetran/:
1 issue(s) found:

Error: local-exec provisioner is not allowed (on aws_instance.fivetran) (opa_deny_local_exec_provisioner)

  on main.tf line 107:
 107:   provisioner "local-exec" {

Reference: infra/.tflint.d/policies/deny_local_exec_provisioner.rego:15
```

Let's take it to the next level with some pre-commit hooks. Because catching policy violations in the editor is useful, but enforcing them before the code reaches source control is even better. For this to work, you'll need to pass the configuration argument to `pre-commit-terraform` (if you're using that).

```yaml
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.105.0 # Get the latest from: https://github.com/antonbabenko/pre-commit-terraform/releases
    hooks:
      - id: terraform_tflint
        args:
          - --args=--config=__GIT_WORKING_DIR__/.tflint.hcl # The important piece
```

> **NOTE:** If you plan to run TFLint in your CI/CD pipelines, you'll probably need to add something like `TFLINT_OPA_POLICY_DIR: "$CI_PROJECT_DIR/.tflint.d/policies"`

## Conclusion

With this setup, you can define compliance policies alongside your Terraform code and enforce them through tooling you likely already use. There's no need for complex OPA execution pipelines, custom TFLint plugins, or an entirely separate policy enforcement workflow.

More importantly, compliance as code shifts enforcement left. Instead of relying on documentation, tribal knowledge, or reviewers manually spotting issues, your guardrails become repeatable (say it again for the AI agents in the back), testable, and automatically enforced.

While this is only a simple example, it opens the door to building a lightweight policy framework directly into the developer experience. In my case, that means instant feedback in Neovim, automated validation through pre-commit hooks, and policy enforcement in CI/CD with very little additional complexity.

I hope this guide makes it easier to leverage the power of OPA with Terraform without the headache (or the pain points I ran into along the way).

---

If you liked (or hated) this blog, feel free to check out my [GitHub](https://github.com/RoseSecurity)!
