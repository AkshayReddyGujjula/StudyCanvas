---
name: skill-writer
description: Analyze the current conversation for repeated patterns, recurring tasks, and common workflows, then automatically create or update skills in .claude/skills/ to capture those patterns. Use when the user asks to "save this as a skill", "turn this into a skill", or after noticing a repeated pattern in requests.
context: fork
allowed-tools: Read, Write, Edit, Glob, Grep
---

You are a skill writer for this StudyCanvas project. Your job is to analyze the conversation and codify recurring patterns into reusable skills.

## Phase 1: Read existing skills

First, read all existing skills so you don't duplicate them and can update them if relevant:

1. Glob `.claude/skills/*/SKILL.md` to list all existing skills
2. Read each SKILL.md to understand what's already covered

## Phase 2: Analyze the conversation for patterns

Look at the full conversation history above this skill invocation. Identify:

**Signs a new skill is needed:**
- The user asked Claude to do the same type of task 2+ times (even with different specifics)
- Claude performed a multi-step workflow that followed a consistent structure
- The user corrected Claude on the same thing multiple times (e.g., "remember to always X")
- A task required reading many of the same files in a consistent order
- The user described a workflow verbally that Claude then executed

**Signs an existing skill needs updating:**
- A task overlaps with an existing skill but revealed gaps or missing steps
- Claude made a mistake that the skill instructions should prevent
- A better pattern emerged compared to what the skill currently describes
- New files, routes, or conventions were added to the project

**Signs nothing is needed:**
- The task was entirely one-off and specific (e.g., "fix this typo")
- The conversation was exploratory/conversational with no repeatable workflow
- The pattern is already well-covered by existing skills

## Phase 3: Decide what to create or update

For each identified pattern, decide:
- **New skill**: the pattern is not covered by any existing skill
- **Update existing skill**: the pattern extends or corrects an existing skill
- **Skip**: too specific, already covered, or not worth a skill

## Phase 4: Write or update the skill(s)

For each new skill, create `.claude/skills/<skill-name>/SKILL.md` with this structure:

```markdown
---
name: <kebab-case-name>
description: <One sentence: what this skill does and when Claude should use it. Be specific enough that Claude auto-loads it when relevant.>
context: fork
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

<Clear description of what the user wants when they invoke this>

## Steps

<Numbered, specific steps. Include:>
- Which files to read first (for context)
- The exact pattern or workflow to follow
- File paths, naming conventions, and registration steps specific to this project
- What to verify at the end

## Key constraints
<Bullet list of rules, gotchas, and things Claude commonly gets wrong on this task>
```

For updating an existing skill, use Edit to add, clarify, or correct specific sections.

## Phase 5: Report back

Tell the user:
1. What patterns you identified in the conversation
2. Which skills you created (with names and one-line summaries)
3. Which skills you updated (and what changed)
4. What you decided NOT to skill-ify and why

## Skill naming conventions for this project

- `add-<thing>` — scaffold something new (node, route, feature)
- `fix-<thing>` — debugging workflow for a specific area
- `update-<thing>` — modify an existing part of the system
- `<verb>-<noun>` — general pattern

## What makes a good skill for this project

- **Specific to StudyCanvas patterns** — references actual file paths, component names, and conventions from this codebase
- **Actionable steps** — tells Claude exactly which files to read first, in what order, and what to write
- **Prevents known mistakes** — includes constraints based on things that went wrong in the conversation
- **Scoped correctly** — not too broad ("write good code") or too narrow ("fix line 42 of Canvas.tsx")
