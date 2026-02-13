---
layout: post
title:  "Terraform Variable Validation Doesn't Work the Way You Think"
tags: terraform infra code quality
---

**Update:** As of [Terraform v1.12](https://github.com/hashicorp/terraform/releases/tag/v1.12.0), logical binary operators now short-circuit. The issue described below has been fixed. If you're on v1.12+, you can use `||` and `&&` in validation conditions without worrying about both sides being evaluated. For those still on older versions, the `try()` workaround remains relevant.

---

I've been seeing a lot of additional bugs in open source Terraform modules lately. Most of them seem to be coming from a misunderstanding of how Terraform variable validation works. In this quick blog, I want to address the misunderstanding and show some proper use cases for variable validation. My personal philosophy is that it should be used for simple use cases, but for those who want to get more complex with it, use cross-variable validation introduced in `1.9.2` (which I pioneered for sadly), and get wild with their/Claude's validation conditions, this blog is for you.

## Using Validation

Let's take an easy use case for variable validation. Let's say that I have a variable that only accepts valid options like `BLOCK` or `NO_ACTION`. Validation is generally performed at the provider layer by larger, well-supported providers like AWS. For example, here's how the AWS provider validates the `event_action` field in the resource schema:

```go
"event_action": {
    Type:             schema.TypeString,
    Required:         true,
    ValidateDiagFunc: enum.Validate[awstypes.CompromisedCredentialsEventActionType](),
},
```

The generic validator works by calling the `Values()` method on the enum type:

```go
func (CompromisedCredentialsEventActionType) Values() []CompromisedCredentialsEventActionType {
    return []CompromisedCredentialsEventActionType{
        "BLOCK",
        "NO_ACTION",
    }
}
```

But we can also layer in our own variable validation to improve the resilience of the module, provide better documented options, and achieve overall higher code quality:

```hcl
variable "event_action" {
  type        = string
  description = "Action to take when compromised credentials are detected"

  validation {
    condition     = contains(["BLOCK", "NO_ACTION"], var.event_action)
    error_message = "event_action must be either 'BLOCK' or 'NO_ACTION'."
  }
}
```

A downside to this approach is that if the API and provider support additional conditions in the future, your downstream code needs to be updated to match what is supported. This is the fun part of maintaining open source Terraform modules...

## The Problem (pre-v1.12)

Prior to Terraform v1.12, validation blocks didn't short-circuit boolean operations. When you wrote a condition like `a || b`, Terraform evaluated *both* sides before applying the logical `||` operator. This was different from most programming languages where `||` short-circuits (if `a` is true, `b` is never evaluated).

Here's a real example I ran into recently:

```hcl
variable "compromised_credentials_risk_configuration" {
  type = object({
    actions = optional(object({
      event_action = string
    }))
  })

  validation {
    condition = (
      var.compromised_credentials_risk_configuration.actions == null ||
      (
        contains(keys(var.compromised_credentials_risk_configuration.actions), "event_action") &&
        length(trimspace(var.compromised_credentials_risk_configuration.actions.event_action)) > 0
      )
    )
    error_message = "When actions is provided, event_action must be non-empty."
  }
}
```

This validation looks correct at first glance: "if actions is null, pass; otherwise check that event_action exists and isn't empty." But when `actions` is actually null, you get:

```
Error: Invalid function argument

  on variables.tf line 697, in variable "compromised_credentials_risk_configuration":
    │ while calling keys(inputMap)
    │ var.compromised_credentials_risk_configuration.actions is null

Invalid value for "inputMap" parameter: argument must not be null.
```

Terraform evaluated `keys(var.compromised_credentials_risk_configuration.actions)` even though the first condition was true. The `||` operator doesn't prevent evaluation of the right-hand side, it just determines the final boolean result.

## The Solution (why simple is better)

On Terraform v1.12+, the original validation condition works as expected since short-circuit evaluation is now supported. For older versions, the fix is to use `try()`:

```hcl
variable "compromised_credentials_risk_configuration" {
  type = object({
    actions = optional(object({
      event_action = string
    }))
  })

  validation {
    condition = (
      var.compromised_credentials_risk_configuration.actions == null ||
      try(length(trimspace(var.compromised_credentials_risk_configuration.actions.event_action)) > 0, false)
    )
    error_message = "When actions is provided, event_action must be non-empty."
  }
}
```

The `try()` function evaluates an expression and returns a fallback value if it fails. When `actions` is null, accessing `.event_action` throws an error, `try()` catches it and returns `false`, and then the `actions == null` condition (which is `true`) makes the whole validation pass. This pattern remains useful as a defensive measure, especially if your module needs to support older Terraform versions.

A few things I've learned:

1. **Keep validations simple.** If your validation condition is longer than a few lines, you're probably overcomplicating it. Complex validations are hard to debug and maintain.

2. **Remember that providers validate too.** Many validations you might write are already handled by the provider. Don't duplicate work unless you have a specific reason (like better error messages or stricter constraints).

Variable validation is a powerful feature. While the short-circuit issue has been resolved in v1.12, these principles around keeping validations simple and understanding what the provider already handles remain valuable.

---

If you hated this blog, feel free to drop some hateful issues and PRs on [my GitHub](https://github.com/RoseSecurity).
