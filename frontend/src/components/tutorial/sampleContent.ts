import type { Node } from '@xyflow/react'
import { jsPDF } from 'jspdf'

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

// ─── Tutorial PDF generation ──────────────────────────────────────────────────
// Generates a proper multi-page PDF using jsPDF so the tutorial content node
// renders in PDF mode (with real page rendering) rather than as plain markdown.

/** Generate a 3-page tutorial PDF and return it as an ArrayBuffer. */
export function generateTutorialPdf(): ArrayBuffer {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const PW = 210   // A4 page width mm
    const PH = 297   // A4 page height mm
    const ML = 18    // left margin
    const MR = 18    // right margin
    const MT = 22    // top margin
    const BODY_W = PW - ML - MR

    // Helper: draw a coloured header band at the top of a page
    function drawPageHeader(title: string, subtitle: string, color: [number, number, number]) {
        doc.setFillColor(...color)
        doc.rect(0, 0, PW, 34, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        doc.text(title, ML, 16)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.text(subtitle, ML, 24)
        doc.setTextColor(30, 30, 30)
    }

    // Helper: add a section heading
    function sectionHeading(text: string, y: number, color: [number, number, number] = [79, 70, 229]): number {
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...color)
        doc.text(text, ML, y)
        doc.setTextColor(30, 30, 30)
        return y + 7
    }

    // Helper: add body text with word-wrap; returns new y position
    function bodyText(text: string, y: number, size = 9.5): number {
        doc.setFontSize(size)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(60, 60, 60)
        const lines = doc.splitTextToSize(text, BODY_W) as string[]
        doc.text(lines, ML, y)
        return y + lines.length * (size * 0.4 + 1.2) + 1
    }

    // Helper: add a callout box
    function calloutBox(text: string, y: number, bgColor: [number, number, number], textColor: [number, number, number]): number {
        const lines = doc.splitTextToSize(text, BODY_W - 8) as string[]
        const boxH = lines.length * 5 + 8
        doc.setFillColor(...bgColor)
        doc.roundedRect(ML, y, BODY_W, boxH, 2, 2, 'F')
        doc.setFontSize(9)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(...textColor)
        doc.text(lines, ML + 4, y + 6)
        doc.setTextColor(30, 30, 30)
        return y + boxH + 4
    }

    // Helper: simple two-column table
    function miniTable(headers: string[], rows: string[][], y: number): number {
        const colW = BODY_W / headers.length
        // Header row
        doc.setFillColor(237, 233, 254)
        doc.rect(ML, y, BODY_W, 7, 'F')
        doc.setFontSize(8.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(79, 70, 229)
        headers.forEach((h, i) => doc.text(h, ML + i * colW + 2, y + 5))
        y += 7
        // Data rows
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(60, 60, 60)
        rows.forEach((row, ri) => {
            if (ri % 2 === 1) {
                doc.setFillColor(248, 248, 252)
                doc.rect(ML, y, BODY_W, 7, 'F')
            }
            row.forEach((cell, ci) => {
                const cellLines = doc.splitTextToSize(cell, colW - 4) as string[]
                doc.setFontSize(8.5)
                doc.text(cellLines, ML + ci * colW + 2, y + 5)
            })
            y += 7
        })
        return y + 4
    }

    // ── Page 1: The Science of Active Learning ──────────────────────────────
    drawPageHeader('The Science of Active Learning', 'StudyCanvas Tutorial Guide — Page 1 of 3', [79, 70, 229])
    let y = MT + 18

    y = bodyText('Active learning means engaging with material rather than passively re-reading it. Research shows it boosts long-term retention by up to 70% compared to passive review.', y)
    y += 2

    y = sectionHeading('The Forgetting Curve', y)
    y = bodyText("Ebbinghaus discovered that without review we forget information rapidly. Within 20 minutes we lose 40% of new material, 66% within 1 day, and 75% within 6 days. The solution is retrieval practice — every time you recall information the memory trace strengthens.", y)
    y += 3

    y = sectionHeading('Core Study Techniques', y)
    y = miniTable(
        ['Technique', 'What It Is', 'Effectiveness'],
        [
            ['Active Recall', 'Test yourself before reviewing', '★★★★★'],
            ['Spaced Repetition', 'Review at increasing intervals', '★★★★★'],
            ['Elaborative Inquiry', 'Ask why and how questions', '★★★★'],
            ['Interleaving', 'Mix topics in one session', '★★★★'],
            ['Passive Re-reading', 'Read notes again', '★'],
        ],
        y,
    )
    y += 2

    y = sectionHeading('Why Highlighting Fails', y)
    y = bodyText("Many students rely on highlighting and re-reading. These create a feeling of familiarity that is often mistaken for knowledge. When exam day arrives the material hasn't been memorised — it just feels familiar.", y)
    y += 3
    y = calloutBox('💡 Try this now: Select any text in this card and click the Ask Gemini button that appears to get an instant AI explanation!', y, [238, 242, 255], [55, 48, 163])

    // Page footer
    doc.setFontSize(8)
    doc.setTextColor(160, 160, 160)
    doc.text('StudyCanvas Tutorial  •  Page 1 of 3', PW / 2, PH - 8, { align: 'center' })

    // ── Page 2: The Feynman Technique ──────────────────────────────────────
    doc.addPage()
    drawPageHeader('The Feynman Technique & Deep Understanding', 'StudyCanvas Tutorial Guide — Page 2 of 3', [16, 122, 87])
    y = MT + 18

    y = bodyText('Named after Nobel Prize-winning physicist Richard Feynman, this method forces deep understanding by requiring you to explain a concept simply enough for a 12-year-old.', y)
    y += 3

    y = sectionHeading('The 4 Steps', y, [16, 122, 87])
    const steps = [
        ['1. Choose a concept', 'Pick one topic you are studying.'],
        ['2. Explain it simply', 'Write or say an explanation without jargon.'],
        ['3. Identify gaps', 'Where you stumble = where your understanding breaks down.'],
        ['4. Go back & fill gaps', 'Return to the source, then explain again.'],
    ]
    for (const [step, desc] of steps) {
        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(16, 122, 87)
        doc.text(step, ML, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(60, 60, 60)
        const dlines = doc.splitTextToSize(desc, BODY_W - 44) as string[]
        doc.text(dlines, ML + 44, y)
        y += Math.max(6, dlines.length * 5)
    }
    y += 2

    y = calloutBox('"If you can\'t explain it simply, you don\'t understand it well enough." — Richard Feynman', y, [240, 253, 244], [21, 128, 61])
    y += 2

    y = sectionHeading('Spaced Repetition Schedule', y, [16, 122, 87])
    y = bodyText('Review material on this schedule for maximum retention: Day 1 → Day 3 → Day 7 → Day 21 → Day 45. Each successful recall pushes the next review further into the future.', y)
    y += 3

    y = sectionHeading('The 80/20 Rule in Studying', y, [16, 122, 87])
    y = bodyText('80% of exam results come from 20% of the material. Identify the high-yield 20% early by reviewing past exam papers, tracking topics you mark as Struggling in quiz nodes, and asking the AI for the most frequently tested concepts.', y)
    y += 3
    y = calloutBox('💡 Try this now: Click "Test me on this page" at the bottom of this card to generate AI quiz questions!', y, [240, 253, 244], [21, 128, 61])

    doc.setFontSize(8)
    doc.setTextColor(160, 160, 160)
    doc.text('StudyCanvas Tutorial  •  Page 2 of 3', PW / 2, PH - 8, { align: 'center' })

    // ── Page 3: Study Environment & Pitfalls ──────────────────────────────
    doc.addPage()
    drawPageHeader('Study Environment & Common Pitfalls', 'StudyCanvas Tutorial Guide — Page 3 of 3', [202, 138, 4])
    y = MT + 18

    y = sectionHeading('Creating Your Optimal Study Environment', y, [180, 120, 0])
    const envItems = [
        ['Dedicated space', 'Use the same location to build a mental focus association.'],
        ['Eliminate notifications', 'It takes 23 minutes to fully regain focus after an interruption.'],
        ['Ambient sound', '60–70 dB background noise (cafe-level) can boost creative thinking.'],
        ['Temperature', '20–22°C is optimal for cognitive performance.'],
        ['Lighting', 'Natural light or warm white bulbs (3000–4000K) reduce eye strain.'],
    ]
    for (const [item, desc] of envItems) {
        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(180, 120, 0)
        doc.text('• ' + item + ':', ML, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(60, 60, 60)
        const dlines = doc.splitTextToSize(desc, BODY_W - 50) as string[]
        doc.text(dlines, ML + 50, y)
        y += Math.max(6, dlines.length * 5)
    }
    y += 3

    y = sectionHeading('The Pomodoro Technique', y, [180, 120, 0])
    y = bodyText('Work in 25-minute focused blocks followed by a 5-minute break. After 4 blocks, take a 15–30 minute break. Creates urgency, prevents fatigue, and trains your brain to concentrate on demand.', y)
    y += 3

    y = sectionHeading('Common Study Mistakes', y, [180, 120, 0])
    y = miniTable(
        ['Mistake', 'Why It Fails', 'Better Alternative'],
        [
            ['Passive re-reading', 'Familiarity ≠ memory', 'Active recall testing'],
            ['Highlighting everything', "Doesn't require thinking", 'Notes in your own words'],
            ['Long unbroken sessions', 'Attention drops after 45 min', 'Pomodoro technique'],
            ['Studying before exams only', 'Cram = forget', 'Consistent spaced review'],
        ],
        y,
    )
    y += 2
    calloutBox('💡 Try this now: Use the Timer button on the left toolbar to add a Pomodoro timer to your canvas!', y, [255, 251, 235], [146, 64, 14])

    doc.setFontSize(8)
    doc.setTextColor(160, 160, 160)
    doc.text('StudyCanvas Tutorial  •  Page 3 of 3', PW / 2, PH - 8, { align: 'center' })

    return doc.output('arraybuffer')
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
            // Show the generated PDF in PDF view mode
            pdfViewerState: { viewMode: 'pdf' },
        },
        style: { width: 700 },
    }
}
