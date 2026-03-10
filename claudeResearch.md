# StudyCanvas — Research, Competitive Analysis & Optimisation Recommendations

**Date:** 10 March 2026
**Scope:** Deep codebase analysis, competitor benchmarking, evidence-based study science, and a prioritised implementation roadmap to make StudyCanvas the most effective revision tool available.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State of StudyCanvas](#2-current-state-of-studycanvas)
3. [Competitor Deep Dive (Top 5)](#3-competitor-deep-dive-top-5)
4. [What Competitors Do Well That We Don't](#4-what-competitors-do-well-that-we-dont)
5. [What ALL Competitors Lack (Our Moat)](#5-what-all-competitors-lack-our-moat)
6. [Evidence-Based Study Science](#6-evidence-based-study-science)
7. [What Students Actually Need During Revision](#7-what-students-actually-need-during-revision)
8. [Prioritised Recommendations](#8-prioritised-recommendations)
9. [Technical Considerations](#9-technical-considerations)
10. [Sources](#10-sources)

---

## 1. Executive Summary

StudyCanvas has a genuinely unique product: an **infinite spatial canvas** where PDFs become interactive knowledge trees. No competitor offers this. However, the application is missing several evidence-backed features that directly improve revision effectiveness — most critically **spaced repetition**, **progress tracking**, and **structured revision sessions**. Implementing these features within the canvas paradigm (not as separate pages) would create a product that competitors cannot replicate, because they are all locked into linear, list-based interfaces.

The recommendations below are ordered by **impact on revision effectiveness** × **competitive differentiation** × **implementation feasibility**. Every item is justified by either competitor evidence, learning science research, or direct user need analysis.

---

## 2. Current State of StudyCanvas

### 2.1 Complete Feature Inventory

**13 Node Types:**

| Node | Purpose |
|------|---------|
| ContentNode | PDF page rendering (markdown/text views) |
| AnswerNode | AI Q&A with streaming, multi-turn follow-ups, status tracking |
| QuizQuestionNode | Per-question quiz with MCQ/short-answer, AI grading, follow-up chat |
| FlashcardNode | Front/back cards with flip animation, manual or AI-generated |
| SummaryNode | AI-generated page summaries (streaming, vision-enhanced) |
| CustomPromptNode | Freeform Gemini chat with model selection + context toggle |
| StickyNoteNode | 6-colour freeform text notes |
| ImageNode | Embedded images with rotation and resize |
| TimerNode | Pomodoro timer (25/5/15 min modes) with session tracking |
| VoiceNoteNode | Audio recorder with live waveform, playback, transcription trigger |
| TranscriptionNode | AI transcription display (spawned from VoiceNoteNode) |
| CodeEditorNode | Syntax-highlighted editor (Python/Java/C) with AI assist |
| CalculatorNode | Full scientific calculator with expression history |

**Backend AI Capabilities (16 endpoints):**
- Streaming Q&A with intelligent context routing (skips PDF for general knowledge questions)
- Two-tier model system (Flash for complex, Lite for simple) with auto-classification
- Quiz generation from struggling nodes OR per-page (MCQ + short-answer mix)
- Flashcard generation with deduplication
- Answer validation (instant MCQ, AI-graded short-answer)
- Page quiz with adaptive difficulty based on education level
- Personalised grading feedback (name, age, level)
- Page summarisation with vision AI
- OCR/vision text extraction
- Audio transcription
- Code generation/editing
- Document conversion (DOCX/PPTX → PDF)
- Auto title generation

**Canvas & UX Features:**
- Infinite React Flow canvas with drag-and-drop node arrangement
- Visual knowledge tree (questions branch from highlighted text)
- Multi-page PDF navigation with pin-to-all-pages
- Drawing/whiteboard tools (2 pens, highlighter, eraser, text tool, lasso selection)
- Node status tracking (understood/struggling/unread)
- Revision modal collecting struggling nodes for targeted quiz/flashcard generation
- PDF export
- Canvas/folder management on homepage
- User context personalisation (name, age, education level)
- Token usage tracking
- Tutorial/onboarding
- LocalStorage + IndexedDB + File System Access API persistence

### 2.2 Architecture Strengths
- **Smart model routing**: `classify_query_complexity()` saves cost by routing simple queries to Lite
- **Context-aware queries**: `_needs_pdf_context()` detects general knowledge questions and skips sending the full PDF, saving thousands of tokens
- **Vision-first approach**: Page images used as primary source for diagrams, handwriting, annotations
- **Canvas context capping**: Quiz/flashcard generation caps canvas context at 50% to prevent off-topic questions
- **Streaming UX**: Real-time streaming for Q&A, summaries, quiz follow-ups, code assist

### 2.3 Current Gaps (identified through analysis)
1. **No spaced repetition** — flashcards exist but have no scheduling algorithm
2. **No progress tracking over time** — only a per-node status label (understood/struggling/unread), no historical data
3. **No structured revision sessions** — no guided "study this material now" flow
4. **Browser-local only** — no cloud sync, data lives in LocalStorage/IndexedDB/File System API
5. **No multi-format input** — only PDF/DOCX/PPTX, no YouTube/website/audio lecture input
6. **No collaboration** — single-user only
7. **No keyboard shortcuts** for common canvas actions
8. **No search across nodes** — can't search through all your Q&A, notes, flashcards
9. **No export of study materials** — can't export flashcards to Anki, quizzes to print, etc.

---

## 3. Competitor Deep Dive (Top 5)

### 3.1 NotebookLM (Google) — Free / $20/mo AI Pro

**What it does well:**
- **Source-grounded AI** — answers only from uploaded documents, dramatically reducing hallucinations
- **Audio Overviews** — converts documents into podcast-style discussions between two AI hosts; "Interactive Mode" lets you interrupt and ask questions mid-podcast. This is NotebookLM's killer feature
- **Video Overviews** — transforms summaries into visual slide-style videos with AI narration
- **Cross-document analysis** — query across multiple uploaded sources simultaneously (up to 50 sources per notebook)
- **Auto-generated study aids** — FAQs, study guides, table of contents, timelines, briefing docs — one click
- **Google Classroom integration** — teachers assign notebooks as "View Only"
- **Infographics & Slide Decks** — AI-generated visual presentations from source material

**What it lacks that StudyCanvas has:**
- ❌ No spatial canvas — purely linear document/chat interface
- ❌ No flashcard system or spaced repetition
- ❌ No quiz generation with AI grading
- ❌ No drawing/annotation tools
- ❌ No integrated study utilities (calculator, timer, code editor)
- ❌ No visual knowledge tree showing question relationships

**Pricing:** Free (100 notebooks, 50 sources each, 50 queries/day). Pro: $20/month (Google AI Pro). College students get Pro FREE for one year.

---

### 3.2 Quizlet — Free / Premium ~$36/yr

**What it does well:**
- **Adaptive Learn Mode** — AI tracks mastered vs. struggling terms, adjusts question difficulty, offers motivational cues. 82% of users achieve A's after using Learn
- **Magic Notes** — paste notes or PDFs, AI generates flashcards and practice tests instantly
- **Multiple study modes** — Learn (adaptive drilling), Write (type from memory), Match (timed games), Test (auto-generated quizzes)
- **500M+ community study sets** — massive library of shared content
- **Gamification** — match games, streaks, progress tracking, motivational cues
- **Cross-device sync** — works everywhere
- **August 2025 upgrades** — smarter ML-enhanced grading, dynamic difficulty adjustment, more motivational engagement

**What it lacks that StudyCanvas has:**
- ❌ No PDF viewing or annotation
- ❌ No spatial canvas
- ❌ No drawing tools
- ❌ No AI Q&A from document content (Q-Chat discontinued June 2025)
- ❌ No knowledge tree visualisation
- ❌ No code editor, calculator, voice notes

---

### 3.3 RemNote — Free / $8-10/mo Pro

**What it does well:**
- **Spaced repetition (SM-2/FSRS)** — the core feature; automatically schedules flashcard reviews at optimal intervals, 20-30% fewer reviews than naive repetition
- **Inline flashcard creation** — write notes and create flashcards simultaneously using `::` syntax
- **Knowledge graph** — visual representation of connections between notes with bi-directional linking
- **PDF annotation** — highlight, margin notes, create flashcards from PDF content
- **AI tools** — auto-summarisation, question generation (Pro)
- **Handwriting support** — tablet handwriting with text conversion
- **Cross-platform sync** — desktop, mobile, web
- **Import support** — Markdown, Obsidian, Workflowy, Dynalist

**What it lacks that StudyCanvas has:**
- ❌ No infinite canvas — uses outliner/document structure
- ❌ No AI Q&A streaming on documents
- ❌ No quiz generation with AI grading
- ❌ No integrated utilities (timer, calculator, code editor)
- ❌ No voice recording
- ❌ Steep learning curve — "not an app you understand in 10 minutes"
- ❌ Free plan limited to 3 PDF annotations

---

### 3.4 Mindgrasp — Free trial / $72-132/yr

**What it does well:**
- **Multi-format input** — PDFs, YouTube videos, audio lectures, websites, articles all in one workspace
- **Live lecture recording** — record class audio, get live AI notes
- **LMS integration** — Blackboard, Canvas (LMS), Moodle, D2L, Schoology
- **Chrome extension** — capture content from any webpage
- **30+ languages** — broadest language support
- **All-in-one** — notes, flashcards, quizzes, Q&A from any media type
- **Web search integration** — AI searches the web when uploaded material doesn't cover a topic
- Users report **73% less time reading**

**What it lacks that StudyCanvas has:**
- ❌ No spatial canvas or visual organisation
- ❌ No drawing/annotation tools
- ❌ No spaced repetition
- ❌ "Doesn't work well with images, especially diagrams or graphs"
- ❌ No integrated study utilities
- ❌ 4-day free trial requires credit card — high friction
- ❌ No knowledge graph or relationship visualisation

---

### 3.5 Revizly — Free

**What it does well:**
- **Three formats in one click** — revision sheets + flashcards + quizzes from a single PDF in 30 seconds
- **Source-faithful AI** — works exclusively from user content, no hallucinations
- **Built-in OCR** — photograph handwritten notes → digital study materials
- **LaTeX support** — proper formula rendering in sheets and flashcards
- **Zero friction** — free, no credit card, instant results
- **Speed** — 30-second generation vs. 2-3 hours manual creation

**What it lacks that StudyCanvas has:**
- ❌ No spatial canvas or visual organisation
- ❌ No spaced repetition — generates materials but no review scheduling
- ❌ No AI Q&A or interactive tutoring
- ❌ No drawing/annotation tools
- ❌ No integrated study utilities
- ❌ No progress tracking
- ❌ Explicitly recommends using Anki + ChatGPT alongside (not all-in-one)

---

## 4. What Competitors Do Well That We Don't

Features **multiple competitors have proven valuable** that StudyCanvas currently lacks:

| Gap | Who Has It | Revision Impact |
|-----|-----------|-----------------|
| **Spaced repetition scheduling** | Quizlet, RemNote, (Anki) | Critical — most robust finding in learning science |
| **Progress tracking / learning analytics** | Quizlet, RemNote, Mindgrasp | High — "can't improve what you can't measure" |
| **Cross-device cloud sync** | All 5 competitors | High — revision happens on phone, tablet, laptop |
| **Multi-format input (YouTube, audio, web)** | NotebookLM, Mindgrasp | Medium — expands what can be studied on canvas |
| **Audio learning (podcast generation)** | NotebookLM | Medium — passive revision during commute/exercise |
| **Gamification (streaks, badges, games)** | Quizlet | Medium — keeps students returning daily |
| **Community/shared content library** | Quizlet (500M+ sets) | Lower — StudyCanvas is personal-first |
| **LMS integration** | Mindgrasp | Lower — institutional adoption driver |

---

## 5. What ALL Competitors Lack (Our Moat)

These are features **no competitor has** — StudyCanvas's unique advantages to double down on:

### 5.1 Infinite Spatial Canvas
Every competitor uses linear, list-based, or document-structured interfaces. StudyCanvas is the only tool where students **spatially arrange** their study materials on an infinite canvas. This maps to how human memory works — spatial memory is one of the strongest memory systems (method of loci / memory palace technique).

### 5.2 Visual Knowledge Tree
Questions spawn connected answer nodes, building a visible **tree of understanding** that shows how concepts relate. Follow-up questions branch further. No competitor visualises the Q&A journey this way.

### 5.3 Freeform Drawing on Study Material
Most competitors offer text highlighting at best. StudyCanvas has a full whiteboard — two pens, highlighter, eraser, text tool, lasso selection — directly on top of study material.

### 5.4 Integrated Study Utilities on Canvas
Calculator, code editor, timer, voice recorder, sticky notes, image insertion — all as canvas nodes alongside the PDF. Students don't switch between apps; everything lives in one spatial workspace.

### 5.5 Contextual Revision from Spatial Organisation
The revision modal collects "struggling" nodes and generates targeted quizzes/flashcards. The spatial layout means students can see patterns in what they struggle with — struggling nodes cluster around specific page sections.

### 5.6 Vision AI for Diagrams & Handwriting
Page images are the **primary** source for quiz generation and grading. StudyCanvas understands diagrams, charts, handwritten notes — exactly where competitors like Mindgrasp explicitly struggle.

**Strategic Insight:** Every improvement should **leverage the canvas** rather than replicate a competitor's linear interface. The canvas IS the differentiator.

---

## 6. Evidence-Based Study Science

| Technique | Evidence | Currently in StudyCanvas? |
|-----------|----------|--------------------------|
| **Active Recall** | Testing yourself is more effective than re-reading (Roediger & Karpicke, 2006). Most robust finding in learning research. | ✅ Partial — quizzes and flashcards exist, but no systematic scheduling |
| **Spaced Repetition** | Reviewing at expanding intervals before forgetting produces dramatic long-term retention gains (Ebbinghaus, 1885; Cepeda et al., 2006). | ❌ Missing — flashcards have no scheduling |
| **Dual Coding** | Visual + verbal simultaneously improves learning — brain processes both separately (Paivio, 1986). | ✅ Partial — canvas is visual, but no explicit dual-coding features |
| **Interleaving** | Mixing topics during study improves discrimination and long-term retention (Rohrer & Taylor, 2007). | ❌ Missing — no system encourages topic mixing |
| **Elaborative Interrogation** | Asking "why" and "how" enhances understanding (Pressley et al., 1987). | ✅ Present — Q&A flow naturally encourages this |
| **Metacognition** | Planning, monitoring, evaluating own learning is a key predictor of success. Students often "believe ineffective strategies are effective." | ✅ Partial — node status labels, but no analytics or guided study planning |
| **Retrieval Practice** | Practicing retrieval from memory strengthens memory traces. | ✅ Partial — quizzes and flashcards, but no structured retrieval sessions |
| **Method of Loci / Spatial Memory** | Using spatial locations as memory anchors — one of the oldest and most effective memory techniques. | ✅ Inherent — the canvas IS a spatial memory system, but not explicitly leveraged |

---

## 7. What Students Actually Need During Revision

Based on research and usage pattern analysis, ordered by importance:

1. **Quick self-testing** — "Do I actually know this?" → Need instant quiz/flashcard access
2. **Targeted review of weak areas** — "What don't I know?" → Need clear visibility of struggling concepts
3. **Scheduled review** — "When should I study this again?" → Need spaced repetition
4. **Structured study sessions** — "What should I do right now?" → Need guided study flows
5. **Time management** — "How long have I been studying?" → ✅ Already have (Timer)
6. **Quick reference** — "What did the answer say about X?" → Need search across nodes
7. **Visual organisation** — "How do these concepts connect?" → ✅ Already have (Canvas tree)
8. **Annotation & note-taking** — "Let me mark this up" → ✅ Already have (Drawing + Sticky Notes)
9. **Formula/calculation support** — "Let me work this out" → ✅ Already have (Calculator + Code Editor)
10. **Progress confidence** — "Am I ready for the exam?" → Need readiness indicators

### What Makes Students Keep Using an App (2025-2026 Research)
- **Time savings on busywork** — flashcard creation, note summarisation
- **Explaining concepts at their level on demand** — 24/7 AI tutor
- **Personalised study sessions** that adapt to gaps
- **Reducing friction** between having content and actually learning it
- Students save **10-15 hours/week** with effective AI study tools
- Students using AI tools score **12% higher on average** (Stanford 2025)
- 92% of students now use AI in their studies (2025 HEPI study)

---

## 8. Prioritised Recommendations

### TIER 1: HIGH PRIORITY — Directly Improves Revision Effectiveness

---

#### 8.1 Spaced Repetition System for Flashcards (FSRS)

**What:** Implement the FSRS (Free Spaced Repetition Scheduler) algorithm for flashcard scheduling. When a student reviews a flashcard, they rate their recall (Again / Hard / Good / Easy). The algorithm computes the optimal next review date. A "Due for Review" indicator surfaces on the canvas showing which flashcards need reviewing today.

**Why it matters:**
- Spaced repetition is the **single most evidence-backed technique** for long-term retention. It reduces required reviews by 20-30% compared to naive repetition while achieving the same or better retention.
- Every serious competitor has it (Quizlet, RemNote, Anki). Its absence is the single biggest functional gap.
- Without it, students create flashcards and forget about them. With it, the app actively brings them back at the optimal moment.

**How it leverages the canvas:**
- Flashcard nodes **glow/pulse** when due for review — a visual spatial cue. Students see where in their knowledge tree the gaps are.
- A "Heat Map" overlay shows canvas regions with many overdue cards in warm colours.
- A "Review Queue" node collects all due flashcards into a focused review session right on the canvas.
- The spatial position of flashcards near their source content reinforces memory association.

**Competitor comparison:**
- Quizlet: Has spaced repetition but no spatial context — flashcards are in flat lists
- RemNote: Uses FSRS but in a linear outline view — no visual heat map
- **StudyCanvas + FSRS: The only tool where spaced repetition is spatial — students SEE where their weak points are on the canvas**

**Technical approach:**
- Use `ts-fsrs` npm package (TypeScript FSRS implementation, ~15KB, runs in browser)
- Add to `FlashcardNodeData`: `nextReview`, `interval`, `easeFactor`, `stability`, `difficulty`, `repetitions`
- Store review history in `canvasStore` and persist to LocalStorage
- No backend changes needed — FSRS runs entirely client-side
- Add `getDueFlashcards()` selector to `canvasStore`

**Effort:** Medium (~3-5 days) | **Impact:** ★★★★★

---

#### 8.2 Canvas Search — Find Anything Instantly

**What:** A search bar (Cmd/Ctrl+F) that searches across all node content on the current canvas — questions, answers, flashcard fronts/backs, sticky note text, quiz questions, summaries, transcriptions. Matching nodes highlight and the canvas pans to show results.

**Why it matters:**
- As canvases grow, finding a specific answer or concept becomes increasingly difficult
- Students frequently think "I remember the AI answered something about mitochondria — which node was it?"
- Quick reference lookup is the #6 most important revision need
- No competitor has this because no competitor has a canvas to search across

**How it leverages the canvas:**
- Search results highlight matching nodes with a glow effect
- Arrow keys cycle through matches, panning the canvas to each one
- Creates a "spatial search" experience — find information AND see where it sits in your knowledge tree

**Technical approach:**
- Search overlay component (similar to browser Ctrl+F)
- Iterate over `useCanvasStore.nodes` and search through `data` fields based on node type
- Use `reactFlowInstance.setCenter()` or `fitView()` to navigate to matches
- Highlight matching nodes via temporary CSS class

**Effort:** Low (~1-2 days) | **Impact:** ★★★★★

---

#### 8.3 Revision Session Mode — Guided Study Flow

**What:** A structured "Start Revision" mode that guides students through their canvas material systematically:
1. Shows which pages/topics have been marked as struggling
2. Quizzes the student on those topics (using existing quiz generation)
3. Presents due flashcards for review (using spaced repetition from 8.1)
4. Tracks time spent and concepts covered
5. Ends with a summary: "You reviewed 12 flashcards, answered 5 quiz questions, and mastered 3 new concepts"

**Why it matters:**
- Students often open study materials and don't know where to start — they waste time deciding what to study
- A guided flow removes decision fatigue and ensures they study the RIGHT things (weak areas, due reviews)
- Combines active recall, spaced repetition, and metacognition in one flow
- Research shows students "believe relatively ineffective strategies are actually the most effective" — a guided session applies effective strategies automatically

**How it leverages the canvas:**
- The session navigates the canvas itself — panning to content nodes, zooming into quiz questions, focusing on flashcards
- The spatial journey through the canvas reinforces location-based memory
- After the session, the canvas shows updated status colours (more green/understood, fewer red/struggling)

**Competitor comparison:**
- Quizlet: Has Learn mode but it's detached from source material
- **No competitor offers a guided revision session that navigates through your actual study workspace**

**Technical approach:**
- UI overlay/panel that orchestrates existing features (quiz generation, flashcard review, node status updates)
- Uses `canvasStore` to find struggling nodes and due flashcards
- Calls existing `/api/quiz` and `/api/validate` endpoints
- Tracks session data in canvasStore; persists session history for progress tracking (8.4)

**Effort:** Medium-High (~5-7 days) | **Impact:** ★★★★★

---

#### 8.4 Progress Dashboard — Track Mastery Over Time

**What:** A dashboard (accessible from homepage or canvas panel) showing:
- Per-canvas mastery percentage (% of nodes marked "understood")
- Per-page breakdown (which pages are fully understood vs. still struggling)
- Revision streak (consecutive days studied)
- Flashcard retention rate (% recalled correctly on first try)
- Total study time (from Timer sessions)
- Weak topic identification ("You keep struggling with Chapter 3, Section 2")
- Historical trend ("Your mastery went from 30% to 78% over the last 2 weeks")

**Why it matters:**
- Progress visualisation creates a motivational feedback loop — students see improvement and are motivated to continue
- Identifies weak areas that need more attention
- Answers the pre-exam question "Am I ready?" with data instead of anxiety
- Every major competitor has analytics; students expect this

**How it leverages the canvas:**
- "Heat map" overlay on the canvas — green where mastered, red where struggling
- Node status history feeds directly into analytics
- Spatial distribution of mastery is unique to StudyCanvas

**Technical approach:**
- Store status change history: `{ nodeId, fromStatus, toStatus, timestamp }`
- Store quiz results: `{ timestamp, questionsCorrect, questionsTotal, topics }`
- Store flashcard review data: `{ timestamp, cardId, rating, responseTime }`
- All client-side in LocalStorage/IndexedDB (no backend needed)
- Lightweight chart library (Recharts, ~45KB gzipped)

**Effort:** Medium (~4-5 days) | **Impact:** ★★★★☆

---

#### 8.5 Keyboard Shortcuts for Canvas Power Users

**What:** Comprehensive keyboard shortcuts for all common canvas actions:

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + F` | Search across nodes (8.2) |
| `Ctrl/Cmd + N` | Add sticky note at cursor |
| `Ctrl/Cmd + Q` | Generate quiz from page |
| `Ctrl/Cmd + Shift + F` | Generate flashcards from page |
| `Ctrl/Cmd + E` | Toggle drawing mode |
| `Space` (hold) | Pan canvas (hand tool) |
| `1-6` (in drawing mode) | Switch drawing tool |
| `Ctrl/Cmd + Z` | Undo (drawing) |
| `Ctrl/Cmd + [/]` | Previous/Next page |
| `Ctrl/Cmd + M` | Minimise/expand selected node |
| `Delete/Backspace` | Delete selected node |
| `?` | Show shortcuts help panel |

**Why it matters:**
- Power users (serious students revising for exams) want speed
- Every productivity tool (Notion, Figma, Miro) has extensive keyboard shortcuts
- Reduces friction during revision — less time navigating, more time learning

**Technical approach:**
- `useEffect` with `keydown` listeners in Canvas.tsx
- Custom `useKeyboardShortcuts` hook
- Respect focus — don't trigger when typing in inputs

**Effort:** Low (~2-3 days) | **Impact:** ★★★★☆

---

### TIER 2: MEDIUM PRIORITY — Enhances the Revision Experience

---

#### 8.6 "Explain Like I'm 5" / Difficulty Slider on Answer Nodes

**What:** A difficulty/complexity control on AnswerNodes that regenerates the same answer at a different level. Options: "Simplify", "Standard", "Advanced". Modifies the AI system prompt accordingly.

**Why it matters:**
- Different students need different explanation levels for the same concept
- A GCSE student and a PhD student highlighting the same passage need very different answers
- Students often read an AI answer and think "I still don't understand" — they need a simpler version
- Common tutoring request: "Can you explain that differently?"

**How it leverages the canvas:**
- The answer node itself changes — student stays in spatial context
- Could show complexity level as a small badge on the node
- Students can have multiple nodes at different levels branching from the same highlight

**Technical approach:**
- 3-level toggle on AnswerNode header
- On change, call `/api/query` with modified system prompt
- Add `complexityLevel: 'simple' | 'standard' | 'advanced'` to `AnswerNodeData`
- Modify query system prompt in `gemini_service.py`

**Effort:** Low (~1-2 days) | **Impact:** ★★★★☆

---

#### 8.7 YouTube / Web Link Import

**What:** Allow students to paste a YouTube URL or web article link. The app extracts the transcript (YouTube) or article text (web page) and creates a ContentNode. All existing features (highlight, Q&A, quiz, flashcards) work on the extracted content.

**Why it matters:**
- Students study from YouTube lectures, blog posts, documentation — not just PDFs
- Mindgrasp and NotebookLM both support YouTube — students expect this
- Currently students manually copy-paste content into sticky notes — removing this friction makes StudyCanvas the single place for all revision material

**How it leverages the canvas:**
- YouTube/web content becomes a regular ContentNode — students interact identically to PDFs
- Place video content alongside PDF nodes, building multi-source knowledge trees
- All existing AI features work on extracted content automatically

**Technical approach:**
- **YouTube:** `youtube-transcript-api` Python package for transcripts. New endpoint `/api/import-youtube`
- **Web articles:** `trafilatura` or `readability-lxml` for extraction. New endpoint `/api/import-url`
- Frontend: URL input option in LeftToolbar or upload popup
- Content goes into standard ContentNode — no new node type needed

**Effort:** Medium (~3-4 days) | **Impact:** ★★★★☆

---

#### 8.8 Quiz-Based Mastery Tracking Per Page

**What:** Track quiz performance per page over time. After completing a page quiz, record the score. Show mastery badges on page navigation (e.g., "Page 3: 85% mastery"). When mastery drops below a threshold or it's been too long since last quiz, show "Review Recommended".

**Why it matters:**
- Students need to know which pages they've actually mastered vs. just read
- Current page quiz is one-shot — no tracking of improvement over time
- Combines active recall with progress tracking
- Answers "Do I know Chapter 3 well enough for the exam?"

**How it leverages the canvas:**
- Mastery indicators on the page navigation bar — visible at a glance
- Coloured borders on ContentNodes (green = mastered, amber = needs review, red = struggling)
- Feeds into Revision Session Mode (8.3) for intelligent session planning

**Technical approach:**
- Store quiz results per page: `{ pageIndex, score, date, questionCount }`
- Compute rolling mastery percentage
- Add mastery badges to page navigation UI
- Simple decay function: mastery decreases over time if not re-quizzed

**Effort:** Low-Medium (~2-3 days) | **Impact:** ★★★★☆

---

#### 8.9 Smart Suggested Questions

**What:** When reading a ContentNode page, show 2-3 AI-generated "suggested questions" as small chips below the content. These are questions the AI thinks would be worth asking. Clicking a chip auto-generates an AnswerNode.

**Why it matters:**
- Students often don't know what questions to ask — they don't know what they don't know
- Acts as a metacognitive scaffold, guiding toward important concepts
- Reduces barrier to engaging with the Q&A system
- Encourages deeper engagement without extra effort

**How it leverages the canvas:**
- Suggested questions appear contextually on the ContentNode
- Clicking spawns new AnswerNodes, building the knowledge tree automatically
- Turns passive reading into active engagement

**Technical approach:**
- New backend endpoint `/api/suggest-questions` — page content → 2-3 questions
- Use MODEL_LITE (cheap, fast)
- Cache suggestions per page
- Small chip/badge UI on ContentNode

**Effort:** Low-Medium (~2-3 days) | **Impact:** ★★★☆☆

---

#### 8.10 Flashcard Deck View — Stacked Review Mode

**What:** A dedicated "Review Flashcards" mode that collects all flashcards on the current canvas (or page) into a stacked deck UI. Students flip through cards one at a time, rate recall (if spaced repetition is active), and see progress through the deck. This is a focused, distraction-free review mode separate from the spatial view.

**Why it matters:**
- Spatial canvas works for creation and association, but for rapid drilling, focused card-by-card view is more efficient
- This is how Quizlet, Anki, and RemNote present flashcard review — because it works for rapid recall practice
- Best of both worlds: spatial creation + focused drilling

**How it leverages the canvas:**
- Flashcards maintain canvas associations — after review, switch back to see them in context
- Deck can be filtered by page, status, or due date
- Review results update flashcard nodes on the canvas (status changes)

**Technical approach:**
- New overlay/modal `FlashcardDeckView` component
- Reads flashcard nodes from `canvasStore`
- Keyboard navigation (Space to flip, arrows for next/prev, 1-4 for FSRS rating)
- Updates via `updateNodeData()` after each review

**Effort:** Medium (~3-4 days) | **Impact:** ★★★★☆

---

### TIER 3: LOWER PRIORITY — Nice-to-Have Improvements

---

#### 8.11 Node Grouping / Sections

**What:** Visually group nodes on the canvas into labelled sections (e.g., "Chapter 3 Notes", "Exam Prep"). Groups have a coloured background rectangle and a title. Nodes can be dragged in and out.

**Why it matters:** As canvases grow, visual organisation becomes critical. Students naturally group related material but have no tool to formalise this.

**Technical approach:** React Flow supports "Group" nodes natively — `type: 'group'` with `parentId` on child nodes.

**Effort:** Medium (~3-4 days) | **Impact:** ★★★☆☆

---

#### 8.12 Export Flashcards to Anki / CSV

**What:** One-click export of all flashcards to Anki-compatible format (.txt tab-separated) or CSV.

**Why it matters:** Anki has 10M+ users. Even Revizly recommends "use Revizly to generate, Anki to memorise." If StudyCanvas implements its own spaced repetition (8.1) this becomes less critical, but still useful for interoperability.

**Technical approach:** Client-side: generate tab-separated text (`front\tback\n`), create Blob + download link.

**Effort:** Low (~1 day) | **Impact:** ★★★☆☆

---

#### 8.13 Collaborative Canvas (Multiplayer Study)

**What:** Multiple students work on the same canvas simultaneously — seeing each other's cursors, nodes, annotations.

**Why it matters:** Group study is common before exams. But this is a massive infrastructure investment (WebSocket server, CRDT/OT, authentication). Better to nail single-user experience first.

**Effort:** Very High (weeks-months) | **Impact:** ★★★☆☆

---

#### 8.14 Dark Mode

**What:** Toggle for dark/light theme across the entire application.

**Why it matters:** Students study at night. Bright white canvas is harsh during extended sessions. Every modern app supports dark mode — its absence is noticeable.

**Technical approach:** Tailwind CSS `dark:` prefix. Store preference in `appStore`. Apply `dark` class to root element.

**Effort:** Medium (~3-4 days — need to audit all components) | **Impact:** ★★★☆☆

---

#### 8.15 Canvas Templates

**What:** Pre-built canvas layouts for common study scenarios:
- "Lecture Review" — ContentNode + StickyNotes + Timer
- "Exam Prep" — ContentNode + Flashcard grid + QuizArea + Progress tracker
- "Essay Research" — Multiple ContentNodes + CustomPromptNode + StickyNotes
- "Problem Set" — ContentNode + CodeEditorNode + CalculatorNode

**Why it matters:** New users don't know how to best use the canvas. Templates demonstrate best practices and reduce setup friction.

**Technical approach:** Store template definitions as JSON (pre-defined nodes/positions). "Use Template" on canvas creation.

**Effort:** Low (~2 days) | **Impact:** ★★★☆☆

---

## 9. Technical Considerations

### 9.1 React Flow Performance

As canvases grow with more features, performance must be actively managed:

- **Enable `onlyRenderVisibleElements`** on `<ReactFlow>` — built-in virtualisation, only renders nodes visible in viewport. Critical for 50+ node canvases. One-line change, massive impact.
- **Memoise all node components** with `React.memo` — already done per CLAUDE.md, verify for new types.
- **Memoise all callback props** with `useCallback` — anonymous functions cause re-renders every frame during pan/zoom.
- **Avoid subscribing to full `nodes`/`edges` arrays** — use fine-grained Zustand selectors for components that only need a subset.
- **Debounce persistence** — `persistToLocalStorage()` should debounce to ~500ms, not fire every drag frame.
- **Simplify node CSS** — reduce shadows, gradients, animations when 50+ nodes visible.
- **Lazy load heavy components** — `React.lazy` + `Suspense` for CodeEditorNode (CodeMirror) and CalculatorNode.
- **Batch node additions** — quiz generation adding 5+ nodes should use a single `setNodes` call.
- **Throttle `onNodeDrag`** — persist position every 100ms, not every frame.

### 9.2 State Management for New Features

Follow existing patterns:

| Feature | Store | Why |
|---------|-------|-----|
| Spaced repetition data | `canvasStore` | Per-canvas flashcard scheduling |
| Progress tracking | `canvasStore` + `appStore` | Per-canvas metrics + cross-canvas aggregates |
| Session history | `canvasStore` → IndexedDB | Can grow large over time |
| User preferences (dark mode, shortcuts) | `appStore` | Global settings |
| Search state | Component-local `useState` | Transient, no persistence needed |

### 9.3 Bundle Size

- `ts-fsrs`: ~15KB — safe to add
- Chart library: `recharts` (~45KB gzipped) or lighter `chart.js` via `react-chartjs-2`
- YouTube transcript extraction: backend-only (`youtube-transcript-api` Python package)
- Avoid heavy deps for features implementable with native APIs

### 9.4 Offline-First Architecture

StudyCanvas already works offline. New features should maintain this:

- FSRS runs entirely client-side — no internet needed
- Progress tracking is entirely client-side
- Search is entirely client-side
- Only YouTube/web import and AI features require internet

---

## 10. Sources

### Competitor Research
- [NotebookLM 2026 Guide — Geeky Gadgets](https://www.geeky-gadgets.com/notebooklm-complete-guide-2026/)
- [Google NotebookLM Explained — The Smart Advice](https://www.thesmartadvice.com/2026/02/google-notebooklm-explained-free-ai.html)
- [NotebookLM Evolution 2023-2026 — Medium](https://medium.com/@jimmisound/the-cognitive-engine-a-comprehensive-analysis-of-notebooklms-evolution-2023-2026-90b7a7c2df36)
- [Quizlet AI-Powered Study Tools](https://quizlet.com/features/ai-study-tools)
- [Quizlet Learn — Adaptive Studying](https://quizlet.com/gb/features/learn)
- [Quizlet Back to School 2025 Launch](https://www.prnewswire.com/news-releases/quizlet-launches-new-ai-powered-experience-for-back-to-school-302521126.html)
- [RemNote — Official Site](https://www.remnote.com/)
- [RemNote Review 2025 — Upbase](https://upbase.io/blog/remnote-review/)
- [RemNote Review 2025 — Toolify](https://www.toolify.ai/ai-news/remnote-review-2025-a-deep-dive-for-students-knowledge-management-3331255)
- [Mindgrasp AI — Official Site](https://www.mindgrasp.ai/)
- [Mindgrasp AI Review — TechRaisal](https://www.techraisal.com/blog/mindgrasp-ai-review-a-smarter-way-to-study-learn-and-work-faster/)
- [Mindgrasp AI 2026 — FahimAI](https://www.fahimai.com/mindgrasp-ai)
- [Revizly — AI Revision Tool](https://revizly.app/ai-revision-tool)
- [Revizly — Best AI Study Tools 2026](https://revizly.app/best-ai-study-tools-2026)

### Study Science & Student Needs
- [17 Best Revision Methods — Immerse Education](https://www.immerse.education/personal-development/productivity-and-adaptability/best-revision-methods-to-try-for-students/)
- [Best Revision Apps — Birmingham City University](https://www.bcu.ac.uk/exams-and-revision/best-ways-to-revise/best-revision-apps)
- [Top 15 Revision Apps 2026 — Amber Student](https://amberstudent.com/blog/post/best-revision-apps-for-students)
- [Revision Techniques Guide — Third Space Learning](https://thirdspacelearning.com/blog/revision-techniques/)
- [Building Study Habits — EEF](https://educationendowmentfoundation.org.uk/news/eef-guest-blog-building-study-habits-and-revision-routines)
- [12 Best AI Study Tools 2026 — My Study Life](https://mystudylife.com/the-12-best-ai-study-tools-students-are-using-in-2026-and-how-they-actually-help-you-learn-faster/)
- [Best AI Study Apps 2026 — Tool Finder](https://toolfinder.co/best/ai-study-apps)

### AI Study Adoption Statistics
- [92% of Students Use AI — Programs.com](https://programs.com/resources/students-using-ai/)
- [How Teens Use and View AI — Pew Research Center](https://www.pewresearch.org/internet/2026/02/24/how-teens-use-and-view-ai/)
- [86% of Students Use AI — Campus Technology](https://campustechnology.com/articles/2024/08/28/survey-86-of-students-already-use-ai-in-their-studies.aspx)

### Technical References
- [React Flow Performance Guide](https://reactflow.dev/learn/advanced-use/performance)
- [Ultimate Guide to React Flow Optimization — Medium](https://medium.com/@lukasz.jazwa_32493/the-ultimate-guide-to-optimize-react-flow-project-performance-42f4297b2b7b)
- [React Flow Optimization Guide — Synergy Codes](https://www.synergycodes.com/blog/guide-to-optimize-react-flow-project-performance)
- [ts-fsrs — TypeScript FSRS Implementation](https://github.com/open-spaced-repetition/ts-fsrs)
- [FSRS on Hacker News](https://news.ycombinator.com/item?id=39002138)
- [Awesome FSRS — Curated Resources](https://github.com/open-spaced-repetition/awesome-fsrs)

---

## Implementation Priority Summary

| # | Feature | Effort | Impact | Tier |
|---|---------|--------|--------|------|
| 8.1 | Spaced Repetition (FSRS) | Medium | ★★★★★ | 1 — HIGH |
| 8.2 | Canvas Search | Low | ★★★★★ | 1 — HIGH |
| 8.3 | Revision Session Mode | Medium-High | ★★★★★ | 1 — HIGH |
| 8.4 | Progress Dashboard | Medium | ★★★★☆ | 1 — HIGH |
| 8.5 | Keyboard Shortcuts | Low | ★★★★☆ | 1 — HIGH |
| 8.6 | Difficulty Slider on Answers | Low | ★★★★☆ | 2 — MEDIUM |
| 8.7 | YouTube / Web Link Input | Medium | ★★★★☆ | 2 — MEDIUM |
| 8.8 | Per-Page Mastery Tracking | Low-Medium | ★★★★☆ | 2 — MEDIUM |
| 8.9 | Smart Suggested Questions | Low-Medium | ★★★☆☆ | 2 — MEDIUM |
| 8.10 | Flashcard Deck View | Medium | ★★★★☆ | 2 — MEDIUM |
| 8.11 | Node Grouping / Sections | Medium | ★★★☆☆ | 3 — LOWER |
| 8.12 | Export to Anki / CSV | Low | ★★★☆☆ | 3 — LOWER |
| 8.13 | Collaborative Canvas | Very High | ★★★☆☆ | 3 — LOWER |
| 8.14 | Dark Mode | Medium | ★★★☆☆ | 3 — LOWER |
| 8.15 | Canvas Templates | Low | ★★★☆☆ | 3 — LOWER |

**Recommended implementation order:** 8.2 (Search) → 8.5 (Shortcuts) → 8.1 (Spaced Repetition) → 8.10 (Deck View) → 8.6 (Difficulty Slider) → 8.8 (Mastery Tracking) → 8.4 (Progress Dashboard) → 8.3 (Revision Session) → 8.9 (Suggested Questions) → 8.7 (YouTube/Web) → remaining Tier 3.

This order starts with **quick wins** that immediately improve UX (Search, Shortcuts), then builds the **retention engine** (Spaced Repetition + Deck View), then layers on **progress tracking and guided sessions** that depend on the retention data.

---

*Research compiled from deep codebase analysis (13 node types, 16 backend endpoints, 2 Zustand stores), competitive analysis of NotebookLM, Quizlet, RemNote, Mindgrasp, and Revizly, and evidence-based study science from cognitive psychology research on spaced repetition, active recall, dual coding, and metacognition.*
