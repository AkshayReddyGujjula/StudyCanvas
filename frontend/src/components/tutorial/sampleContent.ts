import type { Node } from '@xyflow/react'

// ─── Sample tutorial content ──────────────────────────────────────────────────
// Pre-built study guide content — injected into the tutorial canvas without
// needing a real PDF upload or backend call. Works fully offline/on Vercel.
//
// The markdown is split by `## Page N` delimiters so canvasStore.splitMarkdownByPage
// produces exactly 3 pages.

const PAGE_1_MARKDOWN = `## Page 1

# The Science of Active Learning

Welcome to **StudyCanvas**! This sample guide on effective study techniques is your tutorial playground — use every feature you see demonstrated on this content.

## What is Active Learning?

**Active learning** means engaging with material rather than passively re-reading it. Research shows it boosts long-term retention by up to **70%** compared to passive review.

### The Forgetting Curve

Ebbinghaus discovered that without review we forget:

- **40%** of new information within 20 minutes
- **66%** within 1 day
- **75%** within 6 days

The solution is **retrieval practice** — every time you recall information the memory trace strengthens and lasts longer.

### Core Techniques

| Technique | What it is | Effectiveness |
|-----------|-----------|---------------|
| **Active Recall** | Test yourself *before* reviewing | ⭐⭐⭐⭐⭐ |
| **Spaced Repetition** | Review at increasing intervals | ⭐⭐⭐⭐⭐ |
| **Elaborative Interrogation** | Ask *why* and *how* questions | ⭐⭐⭐⭐ |
| **Interleaving** | Mix different topics in one session | ⭐⭐⭐⭐ |
| **Passive re-reading** | Read notes again | ⭐ |

## Why Highlighting Fails

Many students rely on highlighting and re-reading. These create a feeling of familiarity that is often mistaken for knowledge. When exam day arrives the material hasn't actually been memorised — it just *feels* familiar.

> 💡 **Try this now:** Select any text in this card and click the **Ask Gemini** button that appears to get an instant AI explanation!`

const PAGE_2_MARKDOWN = `## Page 2

# The Feynman Technique & Deep Understanding

## What is the Feynman Technique?

Named after Nobel Prize-winning physicist Richard Feynman, this method forces deep understanding by requiring you to explain a concept simply enough for a 12-year-old.

### The 4 Steps

1. **Choose a concept** — Pick one topic you're studying.
2. **Explain it simply** — Write or say an explanation without jargon.
3. **Identify gaps** — Where you stumble = where your understanding breaks down.
4. **Go back & fill gaps** — Return to the source, then explain again.

*"If you can't explain it simply, you don't understand it well enough." — Richard Feynman*

## Spaced Repetition in Practice

Review material on this schedule for maximum retention:

- **Day 1** — First review after learning
- **Day 3** — Second review
- **Day 7** — Third review
- **Day 21** — Fourth review
- **Day 45** — Fifth review

Each successful recall pushes the next review further into the future. Tools like Anki automate this scheduling — but StudyCanvas lets you identify struggling topics and generate targeted revision quizzes!

## The 80/20 Rule in Studying

**80% of exam results come from 20% of the material.** Identify that high-yield 20% early by:

- Reviewing past exam papers
- Tracking which topics you mark as "Struggling" in your quiz nodes
- Asking your AI for the most frequently tested concepts

> 💡 **Try this now:** Click **"Test me on this page"** at the bottom of this card to generate AI quiz questions!`

const PAGE_3_MARKDOWN = `## Page 3

# Study Environment & Common Pitfalls

## Creating Your Optimal Study Environment

Your environment dramatically affects focus and long-term retention.

### The Ideal Setup

- **Dedicated space** — Use the same location for studying to build a mental association between that space and focus
- **Eliminate notifications** — Turn off your phone or use Do Not Disturb. Studies show it takes **23 minutes** to fully regain focus after an interruption
- **Ambient sound** — 60–70 dB background noise (cafe-level) can boost creative thinking
- **Temperature** — 20–22°C is optimal for cognitive performance
- **Lighting** — Natural light or warm white bulbs (3000–4000K) reduce eye strain

## The Pomodoro Technique — Why It Works

Work in **25-minute focused blocks** followed by a **5-minute break**. After 4 blocks, take a 15–30 minute break.

**Benefits:**
- Creates urgency that sharpens focus
- Prevents the mental fatigue that comes from long unbroken sessions
- Trains your brain to concentrate on demand
- Makes large tasks feel achievable by breaking them into sprints

## Common Study Mistakes

| Mistake | Why It Fails | Better Alternative |
|---------|-------------|-------------------|
| Passive re-reading | Creates familiarity, not memory | Active recall testing |
| Highlighting everything | Doesn't require thinking | Take notes in your own words |
| Studying in long blocks | Attention drops after 20–45 min | Pomodoro technique |
| Multitasking | Reduces performance by ~40% | Single-task with deep focus |
| Studying only before exams | Cram = forget | Consistent spaced review |

## Using StudyCanvas Effectively

1. Upload your lecture PDF → get instant markdown notes
2. Ask Gemini about anything you don't understand
3. Use "Test Me" after every page to reinforce learning
4. Mark struggling topics → run Revision Mode before exams
5. Use the Pomodoro timer to stay focused
6. Voice record key concepts while commuting

> 💡 **Try this now:** Use the Timer button on the left toolbar to add a Pomodoro timer to your canvas!`

const FULL_MARKDOWN = [PAGE_1_MARKDOWN, PAGE_2_MARKDOWN, PAGE_3_MARKDOWN].join('\n\n')

const RAW_TEXT = `The Science of Active Learning

Active learning means engaging with material rather than passively re-reading it. Research shows it boosts long-term retention by up to 70%. The Forgetting Curve shows we forget 40% within 20 minutes without review.

The Feynman Technique and Deep Understanding

Named after Richard Feynman, this method forces deep understanding by explaining concepts simply. Review material using spaced repetition: Day 1, 3, 7, 21, 45.

Study Environment and Common Pitfalls

Create an optimal environment: dedicated space, eliminate notifications, ambient sound, optimal temperature. Use the Pomodoro Technique: 25-minute focus blocks followed by 5-minute breaks.`

export const TUTORIAL_FILE_DATA = {
    markdown_content: FULL_MARKDOWN,
    raw_text: RAW_TEXT,
    filename: 'Study_Techniques_Guide',
    page_count: 3,
    pdf_id: undefined as string | undefined,
}

/** Create the initial ContentNode for the tutorial canvas. */
export function createTutorialContentNode(firstPageMarkdown: string): Node {
    return {
        id: 'tutorial-content-node',
        type: 'contentNode',
        position: { x: 100, y: 80 },
        data: {
            markdown_content: firstPageMarkdown,
            filename: 'Study_Techniques_Guide',
            page_count: 3,
            pdf_id: undefined,
            // Text view since there's no real PDF buffer
            pdfViewerState: { viewMode: 'markdown' },
        },
        style: { width: 700 },
    }
}
