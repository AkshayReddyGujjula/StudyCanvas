# Auto Skill Writer — Pattern Detection and Skill Generation

Use this skill to analyze the current session's conversation history, detect repetitive tasks or important patterns, and autonomously write new skill files.

Run this at the end of a long session, or whenever you notice you've repeated similar steps multiple times.

---

## How to Use This Skill

When invoked, you (the AI agent) should:

1. **Review the full conversation history** for this session
2. **Identify patterns** using the detection criteria below
3. **Decide which patterns warrant a skill file** (apply the threshold test)
4. **Write the skill files** to `.claude/commands/` without asking for confirmation
5. **Report back** what was written and why

---

## Pattern Detection Criteria

Scan the conversation for these signals:

### Signal 1: Repeated Multi-Step Sequences
If you performed the same sequence of steps more than once:
- Edited the same 3+ files in the same order
- Ran the same commands to verify
- Applied the same fix to multiple similar locations

→ Skill candidate: A checklist that codifies that sequence

### Signal 2: Stumbling / Correction Loops
If you made the same type of mistake more than once and had to correct it:
- Forgot to update a required location (e.g. types.ts when adding a node)
- Used the wrong import style (`import` vs `import type`)
- Called Gemini from a route file instead of gemini_service.py
- Used Axios for a streaming endpoint

→ Skill candidate: A "don't do X, do Y instead" guardrail skill

### Signal 3: Complex Domain Knowledge Applied
If you had to reason through something non-obvious to get it right:
- The 4 MB PDF boundary logic
- How drawing strokes attach to nodes
- The `updateNodeData` vs `setNodes` distinction
- The handle naming scheme for ContentNode (`right-0` through `right-9`)
- How `_needs_pdf_context()` routes context to Gemini

→ Skill candidate: A focused "how this works" reference skill

### Signal 4: User Repeated the Same Type of Request
If the user asked for similar things across multiple sessions (visible in their prompt phrasing):
- "Add another node that..."
- "Create a new endpoint for..."
- "Make the AI do X with the highlighted text"

→ Skill candidate: A high-level workflow skill for that category

---

## Threshold Test — When to Write a Skill

Write a skill file if the pattern meets ALL of these:
- [ ] The task took more than 5 minutes or 3 tool calls to complete
- [ ] The task would recur in a reasonable future session
- [ ] The skill would provide genuine shortcuts (not just rephrasing the CLAUDE.md)
- [ ] There isn't already a skill that covers it

Do NOT write a skill if:
- It's a one-off task unlikely to repeat
- It's already covered by an existing skill (check `.claude/commands/` first)
- It's too project-specific to generalize (e.g. "fix this one bug")

---

## Skill File Format

Write all new skills to `.claude/commands/<skill-name>.md`

Use kebab-case for filenames. Follow this structure:

```markdown
# Skill Title

One-sentence description of when to use this skill.

---

## When to Use This

Specific trigger conditions (what user request or pattern invokes this).

---

## Step N: [Action]

Concrete instructions with code examples taken from actual StudyCanvas patterns.
Reference real files and line numbers where helpful.

---

## Checklist

- [ ] Item 1
- [ ] Item 2
```

### Quality Standards for Generated Skills:
- Include actual code patterns from the codebase, not generic pseudocode
- Reference specific files and approximate line numbers
- Explain the "why" behind non-obvious rules
- Keep it focused — one skill should cover one task category
- Maximum ~150 lines per skill (longer suggests the task is too broad)

---

## Existing Skills (Do Not Duplicate)

Before writing, check these already exist:

| File | Covers |
|---|---|
| `add-node-type.md` | Adding React Flow node types (types + component + Canvas) |
| `add-api-route.md` | Adding FastAPI routes (schemas + route + main + frontend) |
| `add-gemini-feature.md` | Extending gemini_service.py with new AI capabilities |
| `streaming-feature.md` | Full-stack streaming (AsyncGenerator + ReadableStream + AbortController) |
| `auto-skill-writer.md` | This skill — detecting patterns and writing new skills |

---

## Example: What a Session Might Generate

**Session pattern detected**: User asked to update the Tailwind color palette twice. Each time required changes to `tailwind.config.js` + `Canvas.tsx` color mapping + potentially component files.

**Generated skill**: `.claude/commands/update-color-palette.md` covering:
1. How the custom palette is defined in `tailwind.config.js`
2. The `computeNodeColor()` mapping in `Canvas.tsx`
3. The `STICKY_NOTE_BORDER_COLORS` map for sticky notes
4. Where `bg-primary-*`, `text-secondary-*` etc. classes come from

---

## After Writing Skills

1. Verify each file was written to `.claude/commands/`
2. Update the skills table in `CLAUDE.md` under "Available AI Skills"
3. Commit the new files: `git add .claude/commands/ CLAUDE.md && git commit -m "Add skill: [skill-name]"`
4. Report to the user: list each skill written, what pattern triggered it, and what it covers

---

## Background Execution Note

This skill can be run autonomously at the end of a coding session. The AI should:
- Not ask for permission before writing skill files (the user has authorized this by invoking the skill)
- Write multiple skill files if multiple patterns were detected
- Skip any pattern that doesn't meet the threshold test, without reporting it
- Only report the patterns that were acted upon
