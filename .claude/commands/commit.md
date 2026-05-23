---
name: commit
description: Stage and commit local code changes only. Never push.
---

# Commit Skill

Create a local git commit for the current repository. This command is intentionally local-only: do not push, create PRs, run deployment, or trigger any remote workflow.

## What This Skill Does

1. Inspect repository status.
2. Stage all local changes.
3. Create a commit with a concise message.
4. Verify the local working tree state after the commit.

## Usage

```bash
/commit
/commit -m "your commit message"
```

## Workflow Steps

### Step 1: Verify Git Repository

Check if the current directory is inside a git repository:

```bash
git rev-parse --is-inside-work-tree
```

If this fails, stop and report that the current directory is not a git repository. Do not initialize a new repository unless the user explicitly asks.

### Step 2: Inspect Changes

Review the current worktree before staging:

```bash
git status --short
git diff --stat
```

If there are no changes, report "Nothing to commit - working tree clean" and stop.

### Step 3: Stage All Changes

Stage tracked changes, untracked files, and deletions:

```bash
git add -A
```

### Step 4: Generate Commit Message

If no message was provided via `-m`, generate one from the staged diff:

```bash
git diff --cached --stat
```

The commit message should:
- Be concise.
- Use an imperative subject line.
- Describe what changed, not how.
- Avoid vague subjects such as "update", "fix", or "changes".

### Step 5: Commit

Create a normal verified commit:

```bash
git commit -m "Your commit message here"
```

Never use `--no-verify`. Pre-commit hooks must run.

### Step 6: Verify Local State

After committing, inspect the repository again:

```bash
git status --short
```

If files remain, report the remaining paths. Do not create additional commits unless the user asked to commit everything and the remaining files are part of the same requested work.

## Hard Rules

- Do not run `git push`.
- Do not run `git push -u`.
- Do not create or update pull requests.
- Do not deploy.
- Do not run `/improve`.
- Do not run `/compact`.
- Do not initialize a repository unless explicitly requested.
- Do not use `--no-verify`.

## Output Format

```markdown
## Commit Summary

### Repository
[Repo path]

### Changes Committed
[Brief summary of committed changes]

### Commit
[Commit hash and message]

### Status
[Clean or remaining local changes]
```
