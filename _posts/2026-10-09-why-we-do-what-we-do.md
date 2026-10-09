---
layout: post
title: "Why We Do What We Do"
tags: infra culture resilience devops
---

> _"Simplicity means that the smallest solution that solves the entire
problem is the best solution. It keeps the systems easy to understand
and reduces complex component interactions that can cause debugging
nightmares."_ -The Practice of System and Network Administration

In every infrastructure codebase I maintain, there's a directory called `docs/adr`. It's where I keep the architectural decision records (and regrets) that have accumulated over the years. The topics range from VPC CIDR allocations and tagging conventions to tooling choices and implementation details. The other day, I found myself renaming every file in that directory so I could make room for a new first ADR. I called it `0001-why-we-do-what-we-do.md`.

In this post, I want to talk about the foundations of our work as infrastructure engineers and what lives inside that document. Maybe it finds the engineer trying to make the case for infrastructure as code or a better approach to configuration management. Maybe it finds a seasoned SRE looking to reconnect with the purpose behind the work they do each day. If I'm being honest, part of me wrote this for myself. It's a reminder that the foundations and mission remain the same, regardless of how much AI and technology have changed the way we work day to day.

I've found that most of the technologies we use are simply implementations of larger ideas. Terraform, GitHub, Cloud Custodian, OPA, and dev containers all tools. The specific tools change, but the principles behind them rarely do. The longer I work in infrastructure, the more I find myself caring less about the individual technology and more about the problem it was intended to solve.

## Infrastructure Should Be Reproducible

Infrastructure that exists only in someone's memory eventually becomes a liability. Making a ClickOps change might seem perfectly reasonable when you're managing a single environment, but that approach starts to fall apart as platforms grow, teams expand, and the number of managed resources increases. Changes become difficult to track, difficult to review, and difficult to recover from when something goes wrong. The longer I do this, and if AI has taught me anything, it's that human memory simply doesn't scale.

This is ultimately why we embraced Infrastructure as Code. The goal was never Terraform itself. Terraform just happens to be the implementation we've chosen because we manage AWS, Azure, GCP, GitLab, GitHub, Fortinet products, and other services from a common platform. What matters is that our infrastructure can be recreated from source control, tested with `terraform test` or Terratest, reviewed before deployment (in the PR comment section), and maintained long after the original engineer moves on to something else (or gets hit by a bus). Terraform modules, infrastructure plans, policy validation, automated testing, and security scanning are all extensions of that same idea. **We don't use Infrastructure as Code because it's modern and sexy, although it is. We use it because reproducibility is one of the most important properties a platform can have.**

## Changes ~~Should~~ Must Be Visible

Infrastructure (or firewall rules or whatever stateful resource you think of) is constantly evolving. Teams deploy new applications, adopt new services, retire old systems, and respond to changing business needs. **Without visibility into those changes, troubleshooting is a PIA and institutional knowledge slowly disappears.**

That's what led me to GitOps. Git serves as the source of truth for our infrastructure, configuration, and documentation. We use a trunk-based development model, merge requests, CODEOWNERS, and automated validation pipelines to ensure every change leaves behind a record. Formatting, linting, security scanning, policy validation, and deployment planning all happen before changes are applied. I value GitOps because it creates visibility. Years later, I can look at a change and understand what happened, the why, and the point in time we were at when it happened.

## Problems Should Be Found Early

The cost of a mistake increases the longer it remains undiscovered. A misconfiguration caught during local development might take only a few minutes to fix, but as soon as that goes to prod, it could result in an outage, a compliance violation, or an emergency maintenance window. **If we shift our compliance and standards left, the disruption tends to be cheaper.**

Rather than treating compliance as something that happens after deployment, we try to move those checks as close to development as possible. We use TFLint's OPA ruleset framework to codify organizational standards and validate requirements such as tagging, approved regions, encryption settings, backup requirements, and architectural constraints before infrastructure is deployed. Those preventative controls are complemented by runtime governance tooling such as Cloud Custodian, Service Control Policies (SCPs), Resource Control Policies (RCPs), Checkov, and secret scanning. The specific tools matter less than the goal, which is to provide engineers with feedback while changes are still easy to make rather than after they've become production problems.

## Ownership Should Be Explicit

Some of the most frustrating infrastructure problems I've encountered had nothing to do with technology. They were ownership problems, because nobody knew who owned and maintained a system (or who was responsible when something broke). Systems become surprisingly difficult to operate when accountability is unclear.

That's why I place so much emphasis on tagging, metadata, and ownership standards. **Every resource should have context attached to it.** We enforce tagging standards through policy-as-code and standardized Terraform modules, ensuring resources consistently include ownership, cost allocation, environment, and operational metadata. Those tags drive automation, governance, reporting, cost visibility, and compliance workflows throughout the platform. Tagging isn't really about tags. It's about making ownership obvious and discoverable.

## Knowledge Should Outlive The Engineer

Infrastructure has a habit of surviving its creators. Engineers move on to other projects, other companies, or get hit by a bus. The systems remain, and unfortunately, the context behind a lot of important decisions often disappears long before the infrastructure itself does.

That's the reason ADRs exist in the first place. We maintain architectural decision records, READMEs, comments, runbooks, and supporting documentation because future engineers (and agents) deserve more than a pile of code. Whenever possible, we keep documentation close to the codebase so it evolves alongside the system, and we automate the boilerplate where we can and focus our effort on capturing the context. I had an SRE tell me once that he didn't beat himself up over some of the technical debt their application had accumulated. At the time, those decisions were the right decisions. They didn't have ArgoCD, Flux, or the tooling available today. They solved the problem with the tools and constraints they had. That conversation stuck with me because documentation isn't just a record of what was built, It's a snapshot of the circumstances that existed when it was built.

## Conclusion

Writing `0001-why-we-do-what-we-do.md` isn't about documenting the tools and technologies, because they will come and go. These ideas will likely outlive them, and that's okay. Because AI will undoubtedly change how much of this work gets done, but the fundamentals will remain the same. The longer I work in this field, the more I believe that infrastructure engineering is ultimately about building systems that people can understand, trust, operate, and improve long after we're gone.

And that's why we do what we do.

---

If you liked (or hated) this post, feel free to check out my [GitHub](https://github.com/RoseSecurity).

