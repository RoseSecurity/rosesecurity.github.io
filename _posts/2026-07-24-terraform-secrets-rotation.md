---
layout: post
title:  "Poor Man's Secret Rotation in Terraform"
tags: automation terraform security infra
---

I can't escape IAM user access keys. Every night, I have the same nightmare of asking a Ouija board how I'll die. My fingers slowly move over the letter "AKIA." They are everywhere, but I've done my best to promote, mandate, and migrate teams to IAM roles and other authentication methods. Nevertheless, there are still legacy applications and one-offs that require them. If you can't kill them, you might as well rotate them frequently. So in this short tutorial, I'll demonstrate how to implement "poor man's" secret rotation using Terraform.

## The Module

Let's start with a simple interface that's exposed to your module user. This could be your platform team, self-service modules that other teams are using, or whatever your use case may be. In this module, we create a dedicated IAM user, an IAM access key, and time-based rotation that writes the rotation_date, key, and secret to AWS Secrets Manager. You can swap this out for Vault or another secrets solution too. Here it is:

```hcl
module "kms_seal" {
  source  = "gitlab.com/rosesecurity/iam-user/aws"
  version = "0.1.1"

  enabled = var.enabled

  iam_user_name = "kms-vault-seal"

  access_key_rotation_enabled = true
  write_to_secrets_manager    = true
  secrets_manager_secret_name = "kms-vault-seal"
}
```

This is a simple interface that abstracts away the complexity of creating an IAM user, access key, and rotation. The module will create a new IAM user called `kms-vault-seal`, generate an access key for that user, and set up a rotation schedule that writes the new access key to AWS Secrets Manager.

Here is what the module looks like under the hood:

```hcl
resource "time_rotating" "access_key" {
  count = var.access_key_rotation_enabled ? 1 : 0

  rotation_days = var.access_key_rotation_days
}

resource "aws_iam_access_key" "rotating" {
  count = var.access_key_rotation_enabled ? 1 : 0
  user  = aws_iam_user.iam.name

  lifecycle {
    create_before_destroy = true
    replace_triggered_by  = [time_rotating.access_key[0].id]
  }
}

resource "aws_secretsmanager_secret" "access_key" {
  count = local.write_to_secrets_manager ? 1 : 0

  name = var.secrets_manager_secret_name

  lifecycle {
    precondition {
      condition     = var.secrets_manager_secret_name != null
      error_message = "secrets_manager_secret_name must be set when write_to_secrets_manager is enabled."
    }
  }
}

resource "aws_secretsmanager_secret_version" "access_key" {
  count = local.write_to_secrets_manager ? 1 : 0

  secret_id     = one(aws_secretsmanager_secret.access_key[*].id)
  secret_string = jsonencode({
    access_key_id     = one(aws_iam_access_key.rotating[*].id)
    secret_access_key = one(aws_iam_access_key.rotating[*].secret)
    rotation_date     = one(time_rotating.access_key[*].id)
  })
}
```

> One caveat: Terraform has to run to detect expiration and rotate the credentials. For this to work reliably, use a drift detection pipeline or external orchestration to trigger regular runs.

This isn't a perfect replacement for short-lived credentials, IAM roles, or workload identity. It's a practical improvement when you're stuck supporting long-lived IAM access keys. The real goal should still be to eliminate static credentials wherever possible.

---

If you liked (or hated) this blog, feel free to check out my [GitHub](https://github.com/RoseSecurity)!
