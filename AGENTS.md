# AGENTS

## Agent Instructions
Skills are discovered at startup from local sources. Each entry includes name,
description, and file path so you can open the source for full instructions.

### System Skills
- skill-creator: Guide for creating effective skills.
  - Path: .codex/skills/.system/skill-creator/SKILL.md
- skill-installer: Install Codex skills into $CODEX_HOME/skills from a curated
  list or a GitHub repo path.
  - Path: .system/skill-installer/SKILL.md

### Project Skills
- codex-review: Automated code review using Codex CLI with intelligent fallback to project skills. Use when reviewing code changes, commits, or pull requests.
  - Path: .claude/skills/codex-review/SKILL.md
- vercel-react-best-practices: React and Next.js performance optimization guidelines from Vercel Engineering. Use when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns.
  - Path: .claude/skills/vercel-react-best-practices/SKILL.md
- web-design-guidelines: Review UI code for Web Interface Guidelines compliance. Use when asked to review UI, check accessibility, audit design, or check site against best practices.
  - Path: .claude/skills/web-design-guidelines/SKILL.md

### Skill Discovery
- Available skills are listed in project docs and may also appear in a runtime
  "## Skills" section (name + description + file path).
- These are the sources of truth; skill bodies live on disk at the listed paths.

### Trigger Rules
- If the user names a skill (with $SkillName or plain text) OR the task clearly
  matches a skill description, you must use that skill for the turn.
- Multiple mentions mean use them all.
- Do not carry skills across turns unless re-mentioned.

### Missing or Blocked
- If a named skill is not in the list or the path cannot be read, say so
  briefly and continue with the best fallback.

### How To Use a Skill (Progressive Disclosure)
1) After deciding to use a skill, open its SKILL.md. Read only enough to follow
   the workflow.
2) If SKILL.md points to extra folders (references/), load only the specific
   files needed.
3) If scripts/ exist, prefer running or patching them instead of retyping large
   code blocks.
4) If assets/ or templates exist, reuse them instead of recreating from scratch.

### Description as Trigger
- The YAML description in SKILL.md is the primary trigger signal; rely on it to
  decide applicability. If unsure, ask a brief clarification before proceeding.

### Coordination and Sequencing
- If multiple skills apply, choose the minimal set that covers the request and
  state the order you will use them.
- Announce which skills you are using and why. If you skip an obvious skill,
  say why.

### Context Hygiene
- Keep context small: summarize long sections instead of pasting them.
- Only load extra files when needed; avoid deeply nested references.
- When variants exist (frameworks, providers, domains), pick only relevant
  reference files and note that choice.

### Safety and Fallback
- If a skill cannot be applied cleanly, state the issue, pick the next-best
  approach, and continue.

## Project Decisions (Synced)
Source of truth: DESIGN.md + CLAUDE.md

- Budget is per night in local currency.
- Dates require explicit month/day; infer holiday/relative dates and confirm.
- Default guests = 2.
- Review summary is derived from listing detail reviews (collect >= 10 when available, otherwise all).
- A/B evaluation results are user-visible; comparison logs stay in server logs.
- Output is ordered by price high to low; if no budget, pick 5 high + 5 mid first, then order.
- Chat streaming uses SSE; keep 10 rounds of conversation history.
- MCP backends: Playwright (local) and Browserbase (cloud) with retry + failover.
- Styling uses vanilla CSS (no Tailwind unless requested).
- Rate limit 10 req/min; detail concurrency 3 with 1-2s delays; cooldown 30s.
- Mobile support is not required for MVP.
