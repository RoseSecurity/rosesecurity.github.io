---
layout: post
title: "Five Workflows That Changed My Terminal Life"
tage: cli terminal bash workflow
---

Almost two years ago, I ditched my IDE, most GUI apps, and the bulk of my dev workflows. I was disconnected from my code, discontent, and falling out of love with the craft that once lit me up. So I went back to the CLI to reconnect with the tech I’d grown distant from. Two years later, no regrets. Today, I’m sharing five secret recipes that make my CLI life smoother and sweeter.

## 1. Jira, Bash, and lots of Gum

Jira is my least-favorite tool (Confluence doesn’t even make the cut). But with an API token, a some Bash, and a lot of Gum (Charmbracelet’s TUI candy), I almost never touch the browser. When I’m skimming code and spot something to fix, I stay in flow—`ticketer` pops up, prompts for story points, title, description, and priority, then fires off a Jira ticket.

```sh
#!/usr/bin/env bash

# Generate Jira tickets programmatically
# Requires gum and jira-cli for interactivity
# Install gum: brew install gum

if ! command -v gum &>/dev/null; then
  echo "Error: Gum is not installed. Install it with 'brew install gum'."
  exit 1
fi

# Variables
TYPE="Task"

# Get priority
PRIORITY=$(gum choose --limit=1 --header="Select Priority" "Lowest" "Low" "Medium" "High" "Highest")

# Get title
TITLE=$(gum input --placeholder "Enter Ticket Title")
if [ -z "$TITLE" ]; then
  echo "Error: Ticket Title cannot be empty."
  exit 1
fi

# Get labels
LABELS=$(gum input --placeholder "Enter labels for this ticket (optional)")

# Get description
DESCRIPTION=$(gum write --placeholder "Enter details of this ticket (optional)")

# Get story points. Default to 1 if not provided
STORY_POINTS=$(gum input --placeholder "Enter story points for this ticket")

if [ -z "$STORY_POINTS" ]; then
  STORY_POINTS=1
fi

# Confirm and create the ticket
if gum confirm "Do you want to create this ticket?"; then
  jira issue create \
    -t "$TYPE" \
    -s "$TITLE" \
    -y "$PRIORITY" \
    -b "$DESCRIPTION" \
    -l "$LABELS" \
    --custom story-points="$STORY_POINTS" \
    -a "$(jira me)" \
    --no-input
  if [ $? -eq 0 ]; then
    echo "Ticket created successfully!"
  else
    echo "Error: Failed to create the ticket."
    exit 1
  fi
else
  echo "Ticket creation cancelled."
fi
```

But let's say I wanted to knock out the task now, this nifty Bash script which I call `nb` spins up a git branch slugged with the ticket ID and title. Thanks to Jira ↔ GitHub integration, every commit and PR automatically ties back to the issue.

```sh
#!/bin/bash

# Create Git branches from Jira tickets

# Ensure gum is installed
if ! command -v gum &> /dev/null; then
    echo "gum could not be found, please install it first."
    exit 1
fi

if ! command -v jira &> /dev/null; then
    echo "jira could not be found, please install it first."
    exit 1
fi

# Accept argv[1] as the Jira ticket ID or prompt the user for input
TICKET_ID=$1

if [ -z "$TICKET_ID" ]; then
  TICKET_ID=$(gum input --placeholder "Enter Jira Ticket ID" | xargs -L1 echo)

  if [ -z "$TICKET_ID" ]; then
      echo "No Jira Ticket ID provided. Exiting."
      exit 1
  fi
fi

# Run a spinner while fetching Jira ticket details
ISSUE_DETAILS=$(gum spin --spinner dot --title "Fetching Jira Ticket Details..." -- bash -c "jira issue list --plain | grep '$TICKET_ID'")

if [ -z "$ISSUE_DETAILS" ]; then
    echo "No matching Jira ticket found for ID: $TICKET_ID"
    exit 1
fi

# Extract the title using cut to remove the first two fields (Task type and Ticket ID) and exclude the last field (Status)
TITLE=$(echo "$ISSUE_DETAILS" | cut -d$'\t' -f3- | rev | cut -d$'\t' -f2- | rev | sed 's/^ *//')

# Convert title to a slug (lowercase, replace spaces with dashes, and remove redundant ticket ID prefix if present)
BRANCH_NAME="$TICKET_ID-$(echo "$TITLE" | sed "s/^$TICKET_ID//" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-')"

git checkout -b "$BRANCH_NAME"
```

## 2. PR Reviews with `gh dash`

Sometimes I don't want to leave my terminal for PR reviews, so I fire up `gh dash` (aliased in my `~/.zshrc` to `ghd`) for reviews across different organizations and repos. `gh dash` let's me configure custom sections using GitHub searches to filter down PRs to what matters. This is super useful for open source maintainers who work in lots of repositories on the daily.

```yaml
prSections:
  - title: CloudPosse (Me)
    filters: org:cloudposse author:@me is:open
  - title: CloudPosse Components (Me)
    filters: org:cloudposse-terraform-components author:@me is:open
  - title: CloudPosse (Review)
    filters: org:cloudposse -author:@me is:open -author:renovate[bot] -author:cloudpossebot -author:dependabot[bot] -repo:cloudposse/atmos type:pr sort:created-desc

issuesSections:
  - title: Open
    filters: author:@me is:open -author:@me sort:reactions
  - title: Creator
    filters: author:@me is:open

pager:
  diff: diffnav
defaults:
  view: prs
  refetchIntervalMinutes: 5
  layout:
    prs:
      repoName:
        grow: true,
        width: 10
        hidden: false
      base:
        hidden: true

  preview:
    open: true
    width: 90
  prsLimit: 20
  issuesLimit: 20

theme:
  ui:
    sectionsShowCount: true
    table:
      compact: false
  colors:
    text:
      primary: "#E2E1ED"
      secondary: "#666CA6"
      inverted: "#242347"
      faint: "#B0B3BF"
      warning: "#E0AF68"
      success: "#3DF294"
    background:
      selected: "#1B1B33"
    border:
      primary: "#383B5B"
      secondary: "#39386B"
      faint: "#2B2B40"
```
