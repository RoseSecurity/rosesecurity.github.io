# The Abstraction Debt in Infrastructure as Code

This article serves as the starting point for a microblog series exploring the challenges of managing Infrastructure-as-Code (IaC) at scale. The reflections here are solely my own views, based on my experiences and the lessons learned (sometimes the hard way) when building and maintaining large-scale infrastructure. This first entry lays the groundwork for the complexities, trade-offs, and regrets that come with designing IaC solutions.

## In the Early Days

When we initially adopted IaC, the goal was clear: _manage multiple environments efficiently, at scale, with precision and consistency_. This is a vision many teams share, but as scale grows, the constraints of existing tools become apparent. Terraform’s native capabilities, while powerful (and since expanded with workspaces and other extensible features), were limiting when trying to orchestrate infrastructure across multiple AWS organizations and dozens of accounts in a DRY and reusable way.

I came across numerous tutorials demonstrating the simplicity of spinning up an EC2 instance in `us-east-1`, but when that scales to provisioning 500 servers across multiple AWS organizations, those examples fall apart. At this point, the choices become either extending Terraform’s capabilities with additional tooling or abandoning DRY principles and managing complexity through repetition.

Initially, abstraction seemed like the best answer. However, a problem emerged that I hadn’t anticipated: over-abstraction became a form of technical debt. Abstraction is meant to encapsulate complexity, but when done poorly, it creates opacity—a lack of visibility into what’s actually happening under the hood. When a system inevitably breaks, new team members must wade through multiple layers of abstraction just to diagnose a simple issue. What started as an attempt to simplify infrastructure management ended up creating barriers to understanding and troubleshooting. The real challenge becomes: _How do we balance complexity with simplifying processes without over-abstracting everything?_

## Where Abstraction Becomes a Liability

While abstraction is often framed as a best practice, it can quickly become a liability. Deeply nested modules make understanding resource interactions difficult. Custom wrappers and internal CLIs built on top of Terraform introduce learning curves and debugging complexity. Hidden dependencies, such as implicit tagging schemes or assumptions baked into modules, make troubleshooting non-obvious issues much harder. At some point, abstraction reaches a point of diminishing returns, where the overhead required to maintain and debug it outweighs the benefits of reuse.

## How to Balance Simplicity with Over-Abstraction

To prevent abstraction from becoming a burden, it’s critical to strike the right balance. Escape hatches must exist so engineers can bypass abstractions when needed. A Terraform module should allow direct modification of key parameters rather than enforcing rigid defaults. Observability must be a first-class concern; abstractions should provide clear logs, structured outputs, and access to underlying configurations. Versioning and documentation should be explicit and ensure that abstractions are transparent in their purpose. Finally, abstractions should only be introduced once a pattern has been implemented natively at least once. Premature abstraction often leads to overengineering rather than efficiency.

## Conclusion

The key takeaway is that abstraction in IaC should be a tool for scalability, not avoidance of complexity. If the complexity of an abstraction exceeds the complexity of the problem it was meant to solve, it’s doing more harm than good. This is just the beginning of the discussion. In future posts, I’ll explore random challenges and thoughts that pop up as we navigate the wild world of infrastructure together.
