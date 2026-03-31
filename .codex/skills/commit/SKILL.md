---
name: commit
description: Complete git workflow for this repository. Use when the user asks to commit, checkpoint changes, or push a ready branch.
---

# Commit Workflow

Run a complete and safe git flow for the current repository.

## Inputs

- Optional commit message from the user.

## Steps

1. Check whether the current directory is already a git repository:

```bash
git rev-parse --is-inside-work-tree 2>/dev/null
```

2. If not in a git repository, initialize one:

```bash
git init
```

3. Stage all tracked/untracked/deleted changes:

```bash
git add -A
```

4. If the user did not provide a commit message, generate one from staged changes:

```bash
git diff --cached --stat
```

5. Commit changes. Do not use `--no-verify`.

```bash
git commit -m "<commit message>"
```

6. Verify the worktree is clean:

```bash
git status --porcelain
```

7. If a remote exists, push to upstream when configured:

```bash
git remote -v
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
git push
```

8. If remote exists but upstream does not, set upstream and push:

```bash
git push -u origin $(git branch --show-current)
```

## Error handling

- If pre-commit hooks fail, fix issues, re-stage, and commit again.
- If nothing is staged, report that there is nothing to commit.
- If push fails, show the error and stop retrying automatically.
