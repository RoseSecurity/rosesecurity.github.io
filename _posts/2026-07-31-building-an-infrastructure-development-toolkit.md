---
layout: post
title:  "Building an Infrastructure Development Toolkit"
tags: development containers security infra
---

Infrastructure teams run into an interesting challenge as more people begin contributing to the same codebase. One developer is on Windows, another gray beard on Debian, and the rest (James, the FinOps bro, and the temp consultants) on some combination of macOS and Ubuntu. When all of those environments converge on an infrastructure-as-code repository, differences in package managers, installation methods, and tool versions create friction. One teammate upgrades Homebrew every morning and runs the latest Terraform; another is still on `v1.5.6` like a peasant.

How do we standardize these environments, shorten the time it takes to start contributing, and improve the overall developer experience? My answer is an infrastructure development toolkit: a containerized environment with a consistent set of tools, pinned versions, and a few opinionated Bash/Zsh presets. With only a container runtime and the Dev Container CLI, contributors can start working without recreating the toolchain on their host by hand.

## What Is a Dev Container?

A development container, or dev container, is a container configured to provide a complete development environment. GitHub Codespaces uses this model, but dev containers also work locally with editors such as Visual Studio Code or directly through the Dev Container CLI.

There are two prerequisites: a compatible container runtime, such as Colima, OrbStack, Docker Desktop, Podman, or Rancher Desktop, and a client capable of reading the dev container configuration. The main configuration file is `.devcontainer/devcontainer.json`. A repository can also include a Dockerfile when the environment needs packages or configuration beyond what a prebuilt image provides.

The following configuration builds that Dockerfile, mounts the repository at `/workspace`, and installs the repository's Aqua-managed tools after the container is created. Named volumes preserve the Terraform provider and pre-commit caches between rebuilds without exposing host files to the container. I call my toolkit `dome`, close enough to *domus*, the Latin word for home. It feels like home most days of the week.
Aqua reads the repository's `aqua.yaml`, so tool versions stay in source control instead of being scattered across individual workstations. For an infrastructure repo, that file pins the Terraform toolchain and the security scanners everyone shares:

```yaml
# aqua.yaml
registries:
  - type: standard
    ref: v4.560.0 # renovate: depName=aquaproj/aqua-registry
packages:
  - name: hashicorp/terraform@v1.13.3
  - name: terraform-linters/tflint@v0.59.1
  - name: bridgecrewio/checkov@3.2.524
```

Because the registry reference and every package are pinned, a fresh checkout resolves the exact same binaries on every machine. A tool such as [Renovate](https://docs.renovatebot.com/) can watch these lines and open pull requests when new versions land, keeping upgrades reviewable instead of ad hoc.

> **Note:** You can even take this a step further and parse those versions into your build pipelines, or even use the same dev container images in your pipelines :mind_blown:

## Building the Image

The Dockerfile provides the stable operating-system layer. It installs only the packages needed by the development environment, creates writable cache directories for the non-root user, and uses [`uv`](https://docs.astral.sh/uv/) to install `pre-commit` into an isolated virtualenv pinned to the repository's `.python-version`. Every CLI comes from Aqua (Terraform, TFLint, and Checkov), so the image itself stays lean and each tool is versioned in one place.

```dockerfile
FROM mcr.microsoft.com/devcontainers/base:debian-12@sha256:23fa69fed758b7927c60061317d73baf7d66b9fca5c344e80bce3a940b229af0

ENV CHECKOV_SKIP_UPDATE_CHECK=true \
    TF_IN_AUTOMATION=true \
    TF_INPUT=false \
    TF_PLUGIN_CACHE_DIR=/home/vscode/.terraform.d/plugin-cache

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      direnv \
      file \
      fzf \
      git \
      jq \
      less \
      make \
      neovim \
      openssh-client \
      procps \
      shellcheck \
      unzip \
      vim \
      zoxide \
      zsh \
      zsh-autosuggestions \
    && rm -rf /var/lib/apt/lists/*

RUN install -d -o vscode -g vscode \
      /home/vscode/.cache/pre-commit \
      /home/vscode/.terraform.d/plugin-cache

# For some reason, a lot of people struggle with pre-commit hooks so
# might as well make it easier for them
COPY .python-version /tmp/versions/
ENV UV_INSTALL_DIR=/usr/local/bin
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && PY_VERSION="$(cat /tmp/versions/.python-version)" \
    && uv python install "${PY_VERSION}" \
    && uv venv --python "${PY_VERSION}" /opt/venv \
    && uv pip install --python /opt/venv/bin/python pre-commit \
    && chmod -R a+rX /opt/uv /opt/venv \
    && rm -rf /tmp/versions
ENV PATH="/opt/venv/bin:${PATH}"

# I like sexy prompts
COPY .devcontainer/prompt.zsh /etc/infra-prompt.zsh

# I love ZSH autosuggestions. It's hard to live without after awhile
RUN printf '%s\n' \
      'autoload -Uz compinit && compinit' \
      'source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh' \
      'source /etc/infra-prompt.zsh' \
      >> /home/vscode/.zshrc

WORKDIR /workspace
USER vscode

CMD ["/bin/zsh", "-l"]
```

The base image is pinned by digest so an upstream tag cannot silently change the image being built. The Python interpreter is pinned through `.python-version`, system packages come from the selected Debian release, and every repository-level CLI version lives in `aqua.yaml`. This keeps each layer responsible for one type of dependency and makes upgrades easier to review.

The container runs as the unprivileged `vscode` user during normal development. Root access is still available while the image is being built, but daily commands do not need to run as root (security ftw).

## Nice-to-Haves

Once the core environment works, a few small conveniences can make it feel less like a disposable container and more like a normal workstation.

### Custom Prompt

A distinct prompt makes it obvious when a terminal is running inside the toolkit. This short Zsh snippet adds a `(dome)` prefix and shows the current directory, without loading arbitrary scripts from the host. You can get really creative with this piece if you want to display more info like Kubernetes cluster/context, TF workspaces, yada yada.

```zsh
PROMPT='%B%F{magenta}(dome)%f%b %F{183}%~%f %B%F{magenta}->%f%b '
```

The Dockerfile copies this file into the image and sources it from the container user's `.zshrc`. Keeping the prompt self-contained also makes the image easier to share across a team.

### Host Function

A small host-side function removes the need to remember the Dev Container CLI arguments. It finds the current Git repository, starts its dev container, and opens a login shell inside it.

```zsh
dome() {
  local workspace
  workspace="$(git rev-parse --show-toplevel 2>/dev/null)" || return

  devcontainer up --workspace-folder "$workspace" \
    && devcontainer exec --workspace-folder "$workspace" /bin/zsh -l
}
```

Add the function to your shell configuration (or add a Makefile command for this), then run `dome` from anywhere inside the repository. Because the workspace is resolved at runtime, the function can be reused across any repository that follows the same pattern.

### Makefile Targets

Make targets provide the same workflow without requiring a shell function. The first target starts the container and opens a shell; the second only starts it, which is useful when another command will connect afterward.

```makefile
DEVCONTAINER_CLI ?= devcontainer
DEVCONTAINER_WORKSPACE ?= $(CURDIR)
DEVCONTAINER_SHELL ?= /bin/zsh

.PHONY: dome dome/up

dome: dome/up
$(DEVCONTAINER_CLI) exec --workspace-folder "$(DEVCONTAINER_WORKSPACE)" $(DEVCONTAINER_SHELL) -l

dome/up:
$(DEVCONTAINER_CLI) up --workspace-folder "$(DEVCONTAINER_WORKSPACE)"
```

The variables can be overridden when needed, but the defaults keep the common case simple: `make dome` is enough to enter the toolkit.

### Consistent Tooling in CI

The `aqua.yaml` that provisions the toolkit can provision continuous integration too, so a check that passes locally runs against identical tool versions in the pipeline. Instead of a separate list of `apt` installs or `setup-terraform` steps that drift over time, the workflow installs Aqua and runs `aqua install` against the same pinned file:

```yaml
# .github/workflows/ci.yaml (excerpt)
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aquaproj/aqua-installer@v3.1.1
        with:
          aqua_version: v2.62.2
      - run: aqua install
      - run: pre-commit run --all-files
```

Because the container and the workflow read the same file, a Renovate bump to `aqua.yaml` updates local environments and CI in one pull request. There is no second place to remember, and "works on my machine" stops being a valid excuse.

## Final Thoughts

An infrastructure development toolkit doesn't eliminate every workstation difference, but it moves the important ones into a versioned and reviewable configuration. Then, when things break, they break for everyone! Contributors get the same Terraform ecosystem, security tooling, shell, and editor recommendations without spending hours reproducing someone else's setup.

The security boundary still matters. Treat the container and its dependencies as code, keep credentials out of the image and repository, pin important versions, and review upgrades like any other infrastructure change. With those guardrails, dev containers can make infrastructure development faster, more consistent, and (hopefully) less frustrating.

---

If you liked (or hated) this blog, feel free to check out my [GitHub](https://github.com/RoseSecurity)!
