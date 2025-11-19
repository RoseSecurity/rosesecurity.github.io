---
layout: post
title:  "KISS vs DRY in Infrastructure as Code: Why Simple Often Beats Clever"
tags: terraform culture technicaldebt quality code
---

## The Scale Gap Problem

Every Infrastructure as Code tutorial starts the same way: provision a single S3 bucket, create one EC2 instance, deploy a basic load balancer. The examples are clean, simple, and elegant. You follow along, everything works, and you feel like you understand Terraform.

Then you get to your actual production environment, and everything changes.

You're not starting from scratch with a blank AWS account. You've got existing resources that were manually created two years ago by someone who left the company. There's brownfield infrastructure everywhere with no clear documentation. You need to import existing state, figure out what's actually running, and somehow wrangle it all into code without breaking production. On top of that, you need to manage 200 instances across dev, staging, and production environments. Multiple AWS accounts with different configurations and permissions. Three regions for disaster recovery. Azure for the legacy workloads that nobody wants to touch. GCP running your GKE clusters for the containerized applications.

Suddenly that elegant tutorial code becomes a nightmare of orchestration, state management, environment-specific configurations, and brownfield complexity. You're not just writing infrastructure code anymore. You're trying to organize, orchestrate, and maintain it at scale while dealing with the reality that infrastructure is messy, evolving, and full of historical baggage.

This is the scale gap, and it's where the KISS vs DRY debate stops being theoretical and starts costing real time, money, and engineering effort.

## The DRY Revolution: Solving Yesterday's Problems

When teams hit the scale gap, the instinct is to eliminate repetition. DRY (Don't Repeat Yourself) is gospel in software engineering, so infrastructure engineers did what they do best and built tools to solve the problem.

Terragrunt emerged to manage backend configurations and reduce repetition across environments. Terraspace and other abstraction frameworks followed, promising sophisticated hierarchical inheritance models and dynamic configuration generation. Module libraries grew into complex ecosystems. Teams adopted these patterns because they represented "best practices," not necessarily because they had the specific problems these tools were designed to solve.

The promise was compelling: write your infrastructure once, reuse it everywhere, maintain it in one place, and scale effortlessly.

Terraform itself evolved to address these needs as well, adding workspaces, dynamic blocks, for_each, improved module capabilities, and other features designed to support DRY principles natively.

On paper, it all made perfect sense. In practice, the cost turned out to be higher than anyone expected.

## The Hidden Costs of Going DRY

### When Abstractions Break, Troubleshooting Becomes Archaeological

It's 3 AM and production is down. You need to understand why Terraform is trying to destroy and recreate your database, and you need to understand it right now.

With a DRY setup using Terragrunt and hierarchical inheritance, you're not just reading Terraform code. You're tracing values through multiple layers: the root `terragrunt.hcl` with base configurations, environment-specific overrides in nested directories, dynamically generated backend configurations, module abstractions that call other modules, and variables cascading through inheritance chains.

Where did that database configuration value actually come from? The global config? The environment override? A module default? You're playing detective instead of fixing the problem. Each abstraction layer adds cognitive overhead when you can least afford it, which is during high-pressure incidents at 3 AM.

The fundamental issue is that DRY tooling optimizes for writing code, not reading it under pressure.

### The Onboarding Cliff

It's a new team member's first day and they need to update a security group rule in the staging environment. Simple enough, right?

With DRY abstraction tooling, they need to learn Terraform itself, your module library's conventions and abstractions, Terragrunt (or Terraspace, or your custom wrapper), your hierarchical configuration structure, how values inherit and override across layers, and where to make changes without breaking other environments.

That's not onboarding, that's an apprenticeship. What should take an hour takes days. What should be a simple change becomes a guided tour through your infrastructure philosophy.

Compare this to opening a directory, seeing exactly what gets deployed to staging, making the change, and submitting a PR. The difference in time-to-productivity is measured in weeks.

### Ecosystem Lock-in: The Hidden Technical Debt

Once you've invested in a DRY abstraction framework, you're locked in. Your entire codebase assumes its patterns. Your team has learned its idioms. Your CI/CD pipelines depend on it. Your documentation references it.

Migrating away becomes a massive project that no one wants to fund. Meanwhile, the tool's limitations become your limitations. When Terraform adds new features, you wait for your abstraction layer to support them—if it ever does.

You've traded lines of code for organizational flexibility.

## The KISS Alternative: Orchestration in Pipelines, Simplicity in Code

After years of working with various Terraform patterns, from sophisticated DRY frameworks to custom abstraction layers, I found a pattern that just works: **pure Terraform with GitHub Actions orchestration**.

This isn't about rejecting tools like Terragrunt or Terraspace entirely. They have their place at specific scales and contexts. But for the majority of teams managing infrastructure at moderate scale, there's a simpler path that works better.

### The Core Insight: Complexity Can Only Be Relocated

Orchestration complexity across environments cannot be eliminated. You can't wish away the fact that dev, staging, and production need different configurations, or that multi-region deployments require coordination.

The question isn't "how do we eliminate complexity?" It's "where do we put the complexity to minimize time to business value?"

**DRY approach**: Complexity lives in abstraction tooling and configuration hierarchies
**KISS approach**: Complexity lives in CI/CD pipelines, where it's observable and debuggable

### The Repo Structure: Nested and Navigable

```
├── aws/
│   ├── us-east-1/
│   │   ├── dev/
│   │   │   ├── vpc/
│   │   │   │   ├── main.tf
│   │   │   │   ├── variables.tf
│   │   │   │   ├── backend.tf
│   │   │   │   └── terraform.tfvars
│   │   │   ├── eks/
│   │   │   │   ├── main.tf
│   │   │   │   ├── variables.tf
│   │   │   │   ├── backend.tf
│   │   │   │   └── terraform.tfvars
│   │   │   ├── mwaa/
│   │   │   │   └── [terraform files]
│   │   │   ├── opensearch/
│   │   │   │   └── [terraform files]
│   │   │   └── rds/
│   │   │       └── [terraform files]
│   │   ├── staging/
│   │   │   ├── vpc/
│   │   │   ├── eks/
│   │   │   ├── mwaa/
│   │   │   └── [other services]
│   │   └── prod/
│   │       ├── vpc/
│   │       ├── eks/
│   │       ├── mwaa/
│   │       └── [other services]
│   └── us-west-2/
│       └── [similar structure]
├── azure/
│   └── [similar structure]
├── gcp/
│   └── [similar structure]
└── modules/
    ├── networking/
    ├── compute/
    ├── kubernetes/
    └── databases/
```

**Key characteristics:**
- Can break down by service (eks, mwaa, opensearch) or by logical grouping depending on your needs
- Each service has its own state file, isolated blast radius
- Reusable modules in central directory
- No terraliths, no monolithic state files
- Completely navigable, you can grep for anything

Each service directory is a complete Terraform root module. Open `aws/us-east-1/prod/eks/` and you see exactly what's deployed for your production EKS cluster in us-east-1. No inheritance chains. No dynamic generation. No magic. Just the actual configuration that gets applied.

### Yes, Backend Configs Repeat (And That's Actually a Feature)

```hcl
# aws/core-infrastructure/prod/backend.tf
terraform {
  backend "s3" {
    bucket         = "myorg-terraform-state-prod"
    key            = "core-infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock-prod"
  }
}
```

This config appears in every environment directory with slight variations. DRY purists hate this, but I love it.

When something goes wrong with state, I can immediately see which bucket holds this state, which DynamoDB table provides locking, and I don't need to trace through dynamic generation logic. Running `grep "myorg-terraform-state-prod"` shows me every environment using that bucket instantly.

The cost of repetition is about 100 lines of simple YAML across 20 environments. The benefit is instant troubleshooting, zero cognitive overhead, and perfect clarity about where everything lives.

### Orchestration Lives in Pipelines

This is where the magic happens, and where the orchestration complexity actually belongs.

Home-grown GitHub Actions provide:

**For Pull Requests:**
- Auto-detect which environments changed based on file paths
- Run `terraform plan` for affected environments
- Post plan output as PR comment
- Run security/compliance checks
- Block merge on plan failures

**For Main Branch:**
- Auto-detect environments to apply
- Run `terraform apply` with approval gates
- Alert on failed applies
- Remediate orphaned resources
- Track drift and create tickets

**Scheduled:**
- Nightly drift detection across all environments
- Compare live state to code
- Alert on unexpected changes

The result is minimal troubleshooting, teams freed to focus on business value, and infrastructure that's invisible (which is exactly as it should be).

## Addressing the Objections

### "But You're Repeating Backend Configurations!"

Yes. Intentionally.

100 lines of repeated backend config across environments vs. 40 hours learning Terragrunt's nuances. Which has a better ROI?

Repetition creates greppability. When investigating state issues, `grep "bucket-name"` immediately shows every environment. No tracing through dynamic generation. No "where did this value come from?"

In infrastructure code, transparency trumps terseness every time.

### "You Don't Have Hierarchical Inheritance!"

Correct, and that's also intentional.

Hierarchical inheritance creates implicit dependencies. Values cascade from global to regional to environment-specific configs. When something breaks, you're debugging the inheritance chain instead of the infrastructure.

Without inheritance, every value is explicit in the environment directory. New team members don't need to learn your inheritance model, they just read the config.

The onboarding time saved pays for repeated config 100 times over.

### "This Won't Scale!"

It depends on what you mean by "scale."

200 environments across multiple accounts and regions? This pattern handles it cleanly. Each environment is independent, changes are isolated, and blast radius is contained.

The pattern breaks down at truly massive scale, like 1000+ environments with complex interdependencies. At that point, you need more sophisticated tooling. But be honest: do you actually have that problem, or are you solving for imagined future scale?

Most teams adopt DRY tooling as "best practice" before hitting the scale where it provides value. They pay the complexity cost without reaping the benefits.

## When to Use What: The Nuanced Reality

### KISS Makes Sense When:
- You have fewer than 500 environments
- Team size is small to medium (< 50 engineers)
- Change frequency is low (infrastructure mostly stable after initial deployment)
- Operational clarity is critical (regulated industries, high-stakes infrastructure)
- Team has varied experience levels (sysadmins, not primarily developers)
- Troubleshooting speed matters more than code elegance

### DRY Tooling Makes Sense When:
- You genuinely have massive scale (1000+ environments with interdependencies)
- Your team is primarily platform engineers comfortable with abstraction
- You have dedicated platform team maintaining the tooling
- Environment configurations have complex shared logic that changes frequently
- You're building infrastructure-as-a-product with many consumers
- Compliance requires enforced patterns across all deployments

### The Real Question: What's Your Actual Cost Metric?

**If your cost metric is lines of code written**, choose DRY.
**If your cost metric is time to accomplish business goals**, choose KISS.

Everything that increases time to business value (technical debt from abstraction, lengthy onboarding, opaque troubleshooting) is expensive regardless of how "clean" the code looks.

## The Anti-Pattern: Engineering for Engineering's Sake

The most dangerous trap in infrastructure work is falling in love with the tool or solution rather than the problem.

When teams spend months building sophisticated hierarchies with dynamic generation and complex inheritance models, they're often solving for code aesthetics, not business needs. The infrastructure becomes the focus instead of what it enables.

Good infrastructure engineering is invisible. It lets other teams ship quickly without thinking about the underlying platforms. It doesn't require specialized knowledge to make basic changes. It doesn't become a bottleneck or a point of pride, it's just there, working, quietly enabling the business.

This requires humility. The "clever" solution that demonstrates engineering prowess is often the wrong solution for the business. The "boring" solution that anyone can understand and modify is often right.

## The Minimum Viable Architecture Principle

Start with what you need now. Build it simply. Make it modular so pieces can be replaced. Iterate and improve over time as actual needs emerge.

Don't build for imagined future scale that may never materialize. Don't adopt sophisticated tooling because it's "best practice" if you don't have the problems it solves. Don't engineer abstractions that save lines of code but cost weeks of onboarding time.

**Infrastructure is an auxiliary operation.** Its job is to get out of the way and let the business move fast. Every layer of abstraction, every sophisticated pattern, every clever optimization should be justified by actual business impact—not engineering aesthetics.

## Conclusion: Choose Boring Technology

After years of working with Infrastructure as Code at various scales, here's what I've learned:

Orchestration complexity can't be eliminated, it can only be relocated. The question is where to put it. For most teams, putting that complexity in observable, debuggable CI/CD pipelines beats putting it in abstraction frameworks and configuration hierarchies.

Terraform itself is powerful enough for most use cases. Most teams don't need additional abstraction layers. Pure Terraform with thoughtful repo structure and pipeline orchestration handles moderate scale beautifully while keeping troubleshooting straightforward and onboarding fast.

There's a place for sophisticated DRY tooling at massive scale with dedicated platform teams. But most teams aren't there yet. They're paying complexity costs for benefits they haven't yet earned.

Choose boring technology. Keep it simple. Focus on business velocity over code elegance. Your 3 AM self will thank you.

---

If you liked (or hated) this blog, feel free to check out my [GitHub](https://github.com/RoseSecurity)!
