---
layout: post
title:  "Terraform Tips from the IaC Trenches"
tags: terraform iac infrastructure best-practices devops
---

Infrastructure as Code doesn't have to be crazy complicated. Over years of writing open-source Terraform modules, I've picked up a few syntax tricks that make code safer, cleaner, and easier to maintain. These aren't revolutionary, but they're simple patterns that prevent common mistakes and make your infrastructure more resilient.

---

## Use `one()` for Safer Conditional Resource References

When you conditionally create resources with `count`, don't reach for `[0]` — use `one()`.

### The Problem

It's common to use `count` with a boolean to conditionally create resources:

```hcl
data "aws_route53_zone" "this" {
  count = var.create_dns ? 1 : 0
  name  = "rosesecurity.dev"
}

resource "aws_route53_record" "this" {
  zone_id = data.aws_route53_zone.this[0].zone_id  # ❌ Dangerous
  name    = "blog.rosesecurity.dev"
  type    = "A"
  # ...
}
```

This looks fine and might even work in your dev environment where `var.create_dns = true`. But the moment that variable is `false` in another environment, you get:

```
Error: Invalid index

The given key does not identify an element in this collection value:
the collection value is an empty tuple.
```

The issue? **This fails at runtime, not plan time.** Your code works when the resource exists and breaks when it doesn't.

### The Solution

Use `one()` with the `[*]` splat operator:

```hcl
data "aws_route53_zone" "this" {
  count = var.create_dns ? 1 : 0
  name  = "rosesecurity.dev"
}

resource "aws_route53_record" "this" {
  zone_id = one(data.aws_route53_zone.this[*].zone_id)  # ✅ Safe
  name    = "blog.rosesecurity.dev"
  type    = "A"
  # ...
}
```

The `one()` function (available in Terraform v0.15+) is designed for this exact pattern:

- **If count = 0**: Returns `null` gracefully instead of crashing
- **If count = 1**: Returns the element's value
- **If count ≥ 2**: Returns an error (catches your mistake early)

**When you use `[0]`, you're assuming the resource exists. When you use `one()`, you're validating it exists.**

Bonus: `one()` also works with sets, which don't support index notation at all. Using `one()` makes your code more versatile and future-proof.

---

## Design Better Module Variables with Objects, `optional()`, and `coalesce()`

When building reusable Terraform modules, variable design makes the difference between a module that's fun to use and one that's a configuration nightmare. Here's a pattern that combines several Terraform features to create flexible, well-documented, and maintainable module interfaces.

### The Problem: Scattered Variables

Most modules start simple and grow organically, leading to an explosion of individual variables:

```hcl
# ❌ Scattered variables - hard to manage and document
variable "elasticsearch_subdomain_name" {
  type        = string
  description = "The name of the subdomain for Elasticsearch"
}

variable "elasticsearch_port" {
  type        = number
  description = "Port for Elasticsearch"
  default     = 9200
}

variable "elasticsearch_enable_ssl" {
  type        = bool
  description = "Enable SSL for Elasticsearch"
  default     = true
}

variable "kibana_subdomain_name" {
  type        = string
  description = "The name of the subdomain for Kibana"
  default     = null
}

variable "kibana_port" {
  type        = number
  description = "Port for Kibana"
  default     = 5601
}

variable "kibana_enable_ssl" {
  type        = bool
  description = "Enable SSL for Kibana"
  default     = true
}

# ... and on and on for 12+ more variables
```

This gets unwieldy fast. Users have to understand which variables are related, documentation becomes repetitive, and adding a new service means adding another set of scattered variables.

### The Solution: Group Related Variables into Objects

Use objects with the `optional()` function to group logically related settings:

```hcl
# ✅ Grouped by logical component
variable "elasticsearch_settings" {
  type = object({
    subdomain_name = optional(string)
    port           = optional(number, 9200)
    enable_ssl     = optional(bool, true)
  })

  description = <<-DOC
    Configuration settings for Elasticsearch service.

    subdomain_name: The name of the subdomain for Elasticsearch in the DNS zone (e.g., 'elasticsearch', 'search'). Defaults to environment name.
    port: Port number for Elasticsearch. Defaults to 9200.
    enable_ssl: Enable SSL/TLS for Elasticsearch. Defaults to true.
  DOC
  default = {}
}

variable "kibana_settings" {
  type = object({
    subdomain_name = optional(string)
    port           = optional(number, 5601)
    enable_ssl     = optional(bool, true)
  })

  description = <<-DOC
    Configuration settings for Kibana service.

    subdomain_name: The name of the subdomain for Kibana in the DNS zone (e.g., 'kibana', 'ui'). Defaults to environment name.
    port: Port number for Kibana. Defaults to 5601.
    enable_ssl: Enable SSL/TLS for Kibana. Defaults to true.
  DOC
  default = {}
}
```

The `optional()` function (Terraform v1.3+) lets you define object attributes that users can omit:

```hcl
subdomain_name = optional(string)        # Can be omitted, defaults to null
port           = optional(number, 9200)  # Can be omitted, defaults to 9200
enable_ssl     = optional(bool, true)    # Can be omitted, defaults to true
```

This means users can provide as much or as little configuration as they need:

```hcl
# Minimal - just override subdomain
elasticsearch = {
  subdomain_name = "search"
  # port and enable_ssl use defaults
}

# Or provide nothing, use all defaults
elasticsearch = {}

# Or customize everything
elasticsearch = {
  subdomain_name = "es-prod"
  port           = 9300
  enable_ssl     = false
}
```

### HEREDOC Syntax for Documentation

Use **indented HEREDOC** (`<<-DOC`) to document complex object variables:

```hcl
description = <<-DOC
  Configuration settings for Elasticsearch service.

  subdomain_name: The name of the subdomain for Elasticsearch in DNS.
  port: Port number for Elasticsearch. Defaults to 9200.
  enable_ssl: Enable SSL/TLS. Defaults to true.
DOC
```

**Why the dash matters:**

- `<<-DOC` (with dash): Automatically strips leading whitespace, allowing proper indentation
- `<<DOC` (without dash): Preserves all whitespace, breaking terraform-docs parsing and formatting

The indented version plays nicely with automatic documentation generators like terraform-docs, producing clean, readable output in your README.

### Smart Defaults with `coalesce()` and Context

Combine objects with the [Terraform null label pattern](https://github.com/cloudposse/terraform-null-label) (context.tf) to provide intelligent defaults:

```hcl
# Use locals to apply coalesce logic
locals {
  elasticsearch_subdomain = coalesce(var.elasticsearch.subdomain_name, module.this.environment)
  kibana_subdomain        = coalesce(var.kibana.subdomain_name, module.this.environment)
}

# Resources reference the locals
resource "aws_route53_record" "elasticsearch" {
  zone_id = var.zone_id
  name    = "${local.elasticsearch_subdomain}.rosesecurity.dev"
  type    = "CNAME"
  records = [aws_elasticsearch_domain.this.endpoint]
  ttl     = 300
}

resource "aws_route53_record" "kibana" {
  zone_id = var.zone_id
  name    = "${local.kibana_subdomain}.rosesecurity.dev"
  type    = "CNAME"
  records = [aws_elasticsearch_domain.this.kibana_endpoint]
  ttl     = 300
}
```

The `coalesce()` function returns the first non-null value, giving you:

**Without user input** (in "prod" environment):
- `elasticsearch.prod.rosesecurity.dev`
- `kibana.prod.rosesecurity.dev`

**With user override:**
```hcl
elasticsearch = {
  subdomain_name = "search"
}
```
Results in: `search.prod.rosesecurity.dev`

**Let users configure only what matters, default the rest.**

Group related variables into objects, use `optional()` for flexibility, document with indented HEREDOCs, and combine with `coalesce()` for intelligent defaults. Your module users will thank you.

---

If you liked (or hated) this blog, feel free to check out my [GitHub](https://github.com/RoseSecurity)!
