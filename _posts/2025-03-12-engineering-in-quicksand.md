# Engineering in Quicksand

Welcome to part two of my microblog series on the overlooked killers of engineering teams—the problems that quietly erode productivity in the DevOps community without getting much attention. I previously covered over-abstraction as a liability, showing how excessive layers of abstraction introduce technical debt.

Today, I’m tackling another silent killer: toil. It’s the invisible weight dragging teams down, forcing engineers to maintain instead of build. While some toil is inevitable, too much of it suffocates innovation and drives attrition. Let’s talk about how it happens—and how to stop it.

## The Birth of Toil

---

_"Needing a human in the loop isn’t a feature... it’s a failure. And as your system grows, so does the cost of that failure. What’s ‘normal’ today won’t be tomorrow."_

---

When I first stepped into the world of Site Reliability Engineering, I was introduced to the concept of toil. Google’s SRE handbook defines toil as anything repetitive, manual, automatable, reactive, and scaling with service growth—but in reality, it’s much worse than that. Toil isn’t just a few annoying maintenance tickets in Jira; it’s a tax on innovation. It’s the silent killer that keeps engineers stuck in maintenance mode instead of building meaningful solutions.

I saw this firsthand when I joined a new team plagued by recurring Jira tickets from a failing `dnsmasq` service on their autoscaling GitLab runner VMs. The alarms never stopped. At first, I was horrified when the proposed fix was simply restarting the daemon and marking the ticket as resolved. The team had been so worn down by years of toil and firefighting that they’d rather SSH into a VM and run a command than investigate the root cause. They weren’t lazy—they were fatigued.

This kind of toil doesn’t happen overnight. It’s the result of years of short-term fixes that snowball into long-term operational debt. When firefighting becomes the norm, attrition spikes, and innovation dies. The team stops improving things because they’re too busy keeping the lights on. Toil is self-inflicted, but the first step to recovery is recognizing it exists and having the will to automate your way out of it.

## Addressing Toil and Moving Forward

By now, I’ve spent plenty of time hammering home how toil is silently killing your engineering team, but let’s be real—not all toil is bad. Some engineers actually enjoy the predictability of a well-understood, repeatable task. The problem isn’t toil itself; it’s when it overwhelms a team and leaves no room for innovation.

Toil isn’t a constant—it fluctuates. One quarter might be toil-heavy, while another is more focused on feature development. The key is ensuring that engineers aren’t stuck doing toil indefinitely. Google recommends keeping toil below 50% of an engineer’s time—I go even further and suggest keeping it under 33% over sustained periods. Of course, this depends on on-call schedules, incident response, and team overhead, but the goal is clear: _minimize toil, or it will minimize your team’s effectiveness._

### How to Reduce Toil

1.	**Identify it early**. If a task is manual, repetitive, and requires intervention, label it as toil.
2.	**Automate aggressively**. If a machine can do it, it should be doing it.
3.	**Prioritize fixing toil**. Dedicate at least 33% of sprint time to resolving toil-related issues.
4.	**Create a structured backlog**. Label toil-related tickets (e.g., `KTLO` – Keep The Lights On) and actively allocate resources to fix them.
5.	**Prevent new toil**. Shift left—design systems that don’t introduce unnecessary toil in the first place.

At a previous job, our team made a conscious effort to tackle toil head-on. We dedicated part of every sprint to eliminating KTLO work, balancing long-term architecture improvements with reducing operational pain. Toil will never fully disappear, but by consistently addressing it, you can keep your team focused on meaningful work instead of endless firefighting.

In the end, the best way to deal with toil is to stop introducing it in the first place. It might sound like a cop-out, but good engineering prevents toil before it ever becomes a problem. Shift left, automate, and keep your engineers building—not just maintaining.
