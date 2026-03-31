# Codex Migration Notes

This folder contains project-scoped Codex configuration and migrated assets from `.claude`.

## Mapping from `.claude`

- `.claude/settings.json` -> `.codex/config.toml`
- `.claude/mapping.xml` -> `.codex/mapping.xml`
- `.claude/commands/commit.md` -> `.codex/skills/commit/SKILL.md`
- `.claude/commands/deploy-web-resource.md` -> `.codex/skills/deploy-web-resource/SKILL.md`
- `.claude/commands/export-solution.md` -> `.codex/skills/export-solution/SKILL.md`
- `.claude/rules/core-greeting.md` -> `AGENTS.md` (repo root)

## Why skills are used

Codex supports reusable workflows through skills (`SKILL.md`).
These migrated skills are loaded explicitly via `[[skills.config]]` entries in `.codex/config.toml`.
