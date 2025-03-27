# Rushing Toward Rewrite

This is part three of my microblog series exploring the subtle dysfunctions that plague engineering organizations. After discussing over-abstraction as a liability and unpacking how excessive toil kills engineering teams, this post tackles a nuanced threat: when “moving fast” becomes a cultural shortcut for cutting corners.

## Move Fast and Don’t Break Everything

A former CEO of mine used to say: _“Be fast or be perfect. And since no one’s perfect, you better be fast.”_ Sounds cool until that motto becomes a shield to skip due diligence, code reviews, and even basic security hygiene. Speed wasn’t a value—it was an excuse. PRs rushed. On-call flaring. Postmortems piling. And still, engineers asking for admin access “to move fast.”

Spoiler: they didn’t need it.

The deeper problem? We weren’t a scrappy startup anymore—we were operating at enterprise scale with a startup mindset. The cost of speed was technical debt, fragility, and a long tail of rework. When I transitioned to a new role—back in startup mode—I heard the same “move fast” mantra. But this time, it hit differently. Because here’s the deal: moving fast is possible without setting your future self on fire.

Here’s what I’ve learned:

**1. Fail fast—but fail forward.** Don’t just throw things at prod and hope they stick. Structure your failures. If a solution’s not viable, surface that early with data and a path forward. Good failure leaves breadcrumbs for the next iteration.

**2. Build for iteration.** Forget perfect. Aim for clear next steps. Your `v1` should be designed with a roadmap in mind. Where will this evolve? What trade-offs are you making? Ship it—but know how you’ll ship it _better_.

**3. Stay modular.** Design with exits. If your observability pipeline starts with a pricey SaaS, fine. But make it swappable. Keep your vendor coupling thin so you can self-host later without a rewrite.

**4. Be honest about scale.** What worked for a team of 10 won’t work at 100. “Move fast” looks different when customers depend on your uptime. Match your velocity with the blast radius of your decisions.

We glamorize speed, but the smartest teams know when to slow down, breathe, and make thoughtful decisions that stand the test of time. Move fast—but don’t break the foundation.

