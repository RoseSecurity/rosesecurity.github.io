---
layout: post
title:  "Terraform Proverbs"
tags: terraform code proverbs quality
---

![terraform_logo](/assets/img/terraform-logo.png)

## _Simple, Clear, Maintainable_

---

Clear is better than clever.

Version everything.

Modules should be reusable, not rigid.

State is a liability; manage it wisely.

Every apply should be predictable.

Outputs are for sharing.

Understanding count versus for_each is essential.

Descriptions are for users.

Use positive variable names to avoid double negatives.

Null is not the same as nothing.

Prefer a single object over many related variables.

Terraform is declarative; trust it to converge.

Never output secrets.

Upgrade deliberately, not impulsively.

Name with underscores, not dashes.

Using locals makes code descriptive and maintainable.

