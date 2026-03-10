# StudyCanvas: Comprehensive Research, Competitive Analysis & Optimisation Plan

> **Date**: March 10, 2026
> **Scope**: Full codebase audit, competitor benchmarking, evidence-based revision science review, and prioritised implementation roadmap.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What StudyCanvas Is Today](#2-what-studycanvas-is-today)
3. [Competitor Deep-Dive (Top 5)](#3-competitor-deep-dive-top-5)
4. [Gap Analysis: What Competitors Do That StudyCanvas Does Not](#4-gap-analysis-what-competitors-do-that-studycanvas-does-not)
5. [Gap Analysis: What ALL Competitors Lack (StudyCanvas's Moat)](#5-gap-analysis-what-all-competitors-lack-studycanvass-moat)
6. [What Students Actually Need During Revision (Evidence-Based)](#6-what-students-actually-need-during-revision-evidence-based)
7. [Recommendations: High Priority (Highest Impact)](#7-recommendations-high-priority-highest-impact)
8. [Recommendations: Medium Priority](#8-recommendations-medium-priority)
9. [Recommendations: Lower Priority (Nice-to-Have)](#9-recommendations-lower-priority-nice-to-have)
10. [React Flow Performance Considerations](#10-react-flow-performance-considerations)
11. [Summary Matrix](#11-summary-matrix)

---

## 1. Executive Summary

StudyCanvas occupies a genuinely unique position in the AI study tool market: it is the **only product** that combines an infinite spatial canvas with AI-powered revision tools. Every competitor (NotebookLM, Quizlet, RemNote, Mindgrasp, Revizly) uses linear, list-based, or document-centric interfaces. None of them let students spatially arrange their thinking, draw connections visually, and build knowledge trees from highlighted text.

However, StudyCanvas is missing several features that cognitive science identifies as critical for effective revision, and that competitors have already proven students expect. The single biggest gap is **spaced repetition** -- the most robustly evidenced technique in learning science, present in Quizlet, RemNote, and Anki, but entirely absent from StudyCanvas. The second is **progress tracking and learning analytics** -- students need to see what they know, what they don't, and how they're improving over time.

This document provides **13 justified, prioritised recommendations** that directly improve a student's ability to revise effectively on the canvas, leveraging StudyCanvas's unique spatial advantage where possible.

---

## 2. What StudyCanvas Is Today

### Complete Feature Inventory

**14 Node Types:**

| Node | Purpose |
|------|---------|
| ContentNode | PDF viewer with dual rendering (visual PDF / markdown), text selection, highlighting |
| AnswerNode | AI Q&A with streaming, multi-turn follow-ups, status tracking |
| FlashcardNode | Front/back cards with flip animation, manual or AI-generated |
| QuizQuestionNode | Per-question quiz with MCQ/short-answer, AI grading, follow-up chat |
| CustomPromptNode | Freeform Gemini chat with optional PDF context + vision |
| StickyNoteNode | 6-colour freeform text notes |
| ImageNode | Embedded images with rotation and resize |
| TimerNode | Pomodoro timer (25/5/15 min modes) with session tracking |
| SummaryNode | AI-generated page summaries (streaming, vision-enhanced) |
| VoiceNoteNode | Audio recorder with live waveform, playback, transcription trigger |
| TranscriptionNode | AI transcription display (spawned from VoiceNoteNode) |
| CodeEditorNode | Syntax-highlighted editor (Python/Java/C) with AI assist |
| CalculatorNode | Full scientific calculator with expression history |
| TextNode | Whiteboard freeform text |

**10 Left Toolbar Tools:**
AI Chat, Snipping Tool, Image Upload, Custom Flashcard, Code Editor, Calculator, Sticky Note, Voice Note, Timer, Page Summary

**7 Modal Dialogs:**
QuestionModal, RevisionModal (struggling nodes + page quiz), OnboardingModal, ToolsModal (user context), UsageModal (token tracking), PdfUploadPopup, Tutorial Modals

**Drawing & Whiteboard:**
Pen (2 styles), Highlighter, Eraser, Text, Cursor, Lasso selection -- with undo/redo, per-page strokes, customizable colours

**Backend AI Capabilities (16 endpoints):**
- PDF upload + text extraction (with >4MB client-side fallback)
- DOCX/PPTX conversion to searchable PDF
- Streaming Q&A with complexity-based model routing
- Quiz generation (struggling nodes or per-page, adaptive difficulty)
- Flashcard generation with deduplication
- Answer validation (MCQ instant, short-answer AI-graded)
- Page quiz with personalized grading
- Page summary (streaming, vision-first)
- Quiz follow-up chat (tutor dialogue)
- OCR / vision text extraction
- Audio transcription
- Code generation/editing
- Auto title generation
- 2-tier Gemini model routing (Lite for simple, Flash for complex)

**State Management:**
- Zustand stores (canvasStore per-canvas, appStore global)
- LocalStorage + IndexedDB + File System Access API persistence
- Debounced autosave (2-4s adaptive)

**User Context Personalisation:**
- Name, age, status, education level passed to all Gemini queries
- AI adapts tone and complexity accordingly

---

## 3. Competitor Deep-Dive (Top 5)

### 3.1 NotebookLM (Google)

**What it is:** Google's source-grounded AI research assistant. Upload documents, get AI that only answers from your sources.

**Key features StudyCanvas lacks:**
- **Audio Overviews**: Converts documents into podcast-style discussions between two AI hosts. Students can interrupt ("raise hand") to ask questions, turning passive listening into active tutoring. This is NotebookLM's killer feature.
- **Video Overviews**: Transforms summaries into visual slide-style videos with AI narration, images, and diagrams.
- **Cross-document analysis**: Query across multiple uploaded sources simultaneously.
- **Auto-generated study guides, FAQs, timelines, briefing docs**: One-click structured outputs from source material.
- **Google Classroom integration**: Assign notebooks to students.
- **Infographics & Slide Decks**: AI-generated visual presentations from sources.

**What it lacks that StudyCanvas has:**
- No spatial canvas -- purely document/chat interface
- No drawing tools or whiteboard
- No quiz generation with AI grading
- No flashcards
- No visual knowledge tree
- No integrated study utilities (calculator, timer, code editor)

**Pricing:** Free (100 notebooks, 50 sources each, 50 queries/day). Pro: $20/month (Google AI Pro).

**Source:** [NotebookLM 2026 Guide (Geeky Gadgets)](https://www.geeky-gadgets.com/notebooklm-complete-guide-2026/), [Google NotebookLM Explained (The Smart Advice)](https://www.thesmartadvice.com/2026/02/google-notebooklm-explained-free-ai.html)

---

### 3.2 Quizlet

**What it is:** The dominant flashcard platform (800M+ study sets created worldwide).

**Key features StudyCanvas lacks:**
- **Adaptive Learn Mode**: AI schedules flashcard reviews using spaced repetition, adjusting intervals based on performance.
- **Q-Chat**: AI chatbot that quizzes you conversationally.
- **Magic Notes**: Paste notes or URLs, AI generates flashcards and practice tests instantly.
- **Gamified study modes**: Match games, timed challenges, leaderboards.
- **Community library**: 800M+ shared study sets from other students.
- **Cross-device sync**: Full cloud sync across all devices.

**What it lacks that StudyCanvas has:**
- No PDF viewing or annotation
- No spatial canvas
- No drawing tools
- No integrated Q&A from document content
- No knowledge tree visualisation
- No code editor, calculator, voice notes

**Pricing:** Free (basic). Plus: $35.99/year.

**Source:** [Quizlet Review 2025 (StudyDrome)](https://studydrome.com/guides/quizlet-review/), [Quizlet AI Features](https://quizlet.com/features/ai-study-tools)

---

### 3.3 RemNote

**What it is:** Knowledge management + spaced repetition tool combining note-taking, PDF annotation, and flashcard creation.

**Key features StudyCanvas lacks:**
- **Spaced repetition (FSRS algorithm)**: The most sophisticated SRS implementation after Anki. 20-30% fewer reviews than SM-2 for the same retention.
- **Inline flashcard creation**: Create flashcards directly within notes using `::` syntax -- no context switching.
- **Knowledge graph**: Visual representation of connections between all notes, dynamically updated.
- **Bi-directional linking**: Automatic backlinks between related concepts.
- **Cross-platform sync**: Desktop, mobile, web -- all synced.
- **Templates**: Reusable note structures for different subjects.

**What it lacks that StudyCanvas has:**
- No infinite spatial canvas (knowledge graph is auto-generated, not user-arranged)
- No drawing/whiteboard tools
- No AI Q&A from highlighted PDF text
- No quiz generation with AI grading
- Limited AI features in free plan (3 PDF annotations)
- No integrated utilities (calculator, timer, code editor)

**Pricing:** Free (unlimited notes/flashcards). Pro: $8/month billed annually.

**Source:** [RemNote Review (Upbase)](https://upbase.io/blog/remnote-review/), [RemNote FSRS Algorithm](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm)

---

### 3.4 Mindgrasp

**What it is:** AI-powered productivity tool that extracts insights from lectures, documents, videos, and websites. 500K+ users.

**Key features StudyCanvas lacks:**
- **Multi-format input**: YouTube videos, audio lectures, websites, articles -- not just PDFs.
- **Live lecture recording**: Record class in real-time, AI takes notes live.
- **LMS integration**: Works inside Blackboard, Canvas (the LMS), Moodle, D2L, Schoology.
- **Chrome extension**: Capture content from any webpage.
- **30+ language support**: Multilingual note generation.
- **Web search integration**: AI searches the web when uploaded material doesn't fully cover a topic.

**What it lacks that StudyCanvas has:**
- No spatial canvas
- No drawing tools or whiteboard
- Poor with images/diagrams/graphs (noted limitation)
- No visual knowledge tree
- No integrated study utilities
- No freeform annotation

**Pricing:** Basic ~$72/year, Scholar ~$108/year, Premium ~$132/year. Free trial: 4 days only.

**Source:** [Mindgrasp AI Review (TechRaisal)](https://www.techraisal.com/blog/mindgrasp-ai-review-a-smarter-way-to-study-learn-and-work-faster/), [Mindgrasp AI 2026 (FahimAI)](https://www.fahimai.com/mindgrasp-ai)

---

### 3.5 Revizly

**What it is:** Fastest PDF-to-revision-material tool. Transforms courses into sheets, flashcards, and MCQs in 30 seconds.

**Key features StudyCanvas lacks:**
- **One-click triple generation**: PDF → revision sheets + flashcards + quizzes simultaneously.
- **LaTeX rendering**: Mathematical formulas properly rendered in study materials.
- **OCR for handwritten notes**: Camera → digital study materials.
- **Curriculum-aligned output**: Revision sheets formatted for official exam curricula.

**What it lacks that StudyCanvas has:**
- No spatial canvas
- No interactive Q&A from highlighted text
- No drawing tools
- No knowledge tree
- No spaced repetition (recommends using Anki separately)
- No integrated utilities
- No voice notes or audio support

**Pricing:** Free for students.

**Source:** [Revizly AI Study Tool](https://revizly.app/ai-revision-tool), [Revizly Exam Prep 2026](https://revizly.app/exam-prep-2026)

---

## 4. Gap Analysis: What Competitors Do That StudyCanvas Does Not

These are features that **multiple competitors offer** and that students clearly value, ranked by how many competitors have them and how much they impact revision effectiveness:

| Gap | Who Has It | Impact on Revision | Priority |
|-----|-----------|-------------------|----------|
| **Spaced repetition scheduling** | Quizlet, RemNote, (Anki) | Critical -- most robust finding in learning science | Highest |
| **Progress tracking / learning analytics** | Quizlet, RemNote, Mindgrasp | High -- students can't improve what they can't measure | High |
| **Cross-device cloud sync** | All 5 competitors | High -- revision happens on phone, tablet, laptop | High |
| **Multi-format input (YouTube, audio, web)** | NotebookLM, Mindgrasp | Medium -- expands what can be studied on canvas | Medium |
| **Audio learning (podcast generation)** | NotebookLM | Medium -- passive revision during commute/exercise | Medium |
| **Gamification (streaks, badges, games)** | Quizlet | Medium -- keeps students returning daily | Medium |
| **Community/shared content library** | Quizlet | Lower -- StudyCanvas is personal-first | Lower |
| **LMS integration** | Mindgrasp | Lower -- nice for institutional adoption | Lower |

---

## 5. Gap Analysis: What ALL Competitors Lack (StudyCanvas's Moat)

These are features **no competitor has** that StudyCanvas should double down on:

| Unique Advantage | Why It Matters |
|-----------------|----------------|
| **Infinite spatial canvas** | Leverages spatial memory. Research shows visual-spatial arrangement improves recall and connection-finding. Students can "zoom out" to see the big picture or "zoom in" to details. No competitor offers this. |
| **Visual knowledge tree (branching Q&A)** | Questions spawn connected answer nodes, building a visible tree of understanding. Students can see the structure of their thinking. Completely unique. |
| **Freeform drawing + annotation on study material** | Pen, highlighter, eraser, text directly on the canvas alongside AI nodes. Most competitors offer basic highlighting at best. |
| **Integrated study utilities on canvas** | Calculator, timer, code editor, voice recorder, sticky notes -- all as spatial nodes alongside study material. Competitors require switching between apps. |
| **Contextual revision from spatial arrangement** | The "struggling nodes" system collects all struggling items and generates targeted revision quizzes. The spatial layout means students can see patterns in what they struggle with. |
| **Node status workflow** | Unread → Understood / Struggling with visual colour coding. Makes revision state visible at a glance across the entire canvas. |

**Strategic insight:** StudyCanvas's moat is the spatial canvas. Every improvement should **leverage the canvas** rather than replicate a competitor's linear interface. The goal is to make the canvas itself the reason students come back.

---

## 6. What Students Actually Need During Revision (Evidence-Based)

Based on cognitive science research and student surveys:

### The Big 3 (Non-Negotiable for Effective Revision)

1. **Active Recall / Self-Testing** -- Retrieving information without looking strengthens memory pathways. StudyCanvas has this via quizzes and flashcards. **Status: Partially covered.**

2. **Spaced Repetition** -- Reviewing just before you forget, with expanding intervals. The most replicated finding in memory research. Students using spaced repetition need 20-30% fewer reviews for the same retention. **Status: Completely missing.**

3. **Metacognitive Awareness** -- Knowing what you know and what you don't. Planning, monitoring, and evaluating your own learning. Research shows students often believe ineffective strategies are effective. **Status: Partially covered** (node status tracking), but no analytics or guided study planning.

### The Supporting Cast (High Value)

4. **Dual Coding** -- Visual + verbal simultaneously. The canvas is inherently a dual-coding tool (spatial arrangement + text content). **Status: Strong foundation, could be enhanced.**

5. **Interleaving** -- Mixing topics during study rather than blocking. **Status: Not explicitly supported.**

6. **Progress Tracking** -- Students can't improve what they can't measure. 78% of students using AI tools report better grades when tools provide performance feedback. **Status: Missing.**

7. **Focus & Time Management** -- Pomodoro, distraction blocking. **Status: Timer exists, no focus/distraction features.**

8. **Personalisation** -- AI adapting to knowledge gaps. **Status: User context exists, but no adaptive learning path.**

### What Makes Students Keep Using an App

According to 2025-2026 research:
- **Time savings on busywork** (flashcard creation, note summarisation)
- **Explaining concepts at their level on demand**
- **Personalised study sessions** that adapt to gaps
- **Reducing friction** between having content and actually learning it
- Students save 10-15 hours/week with effective AI study tools
- Students using AI tools score 12% higher on average (Stanford 2025)

**Source:** [Immerse Education - Best Revision Methods](https://www.immerse.education/personal-development/productivity-and-adaptability/best-revision-methods-to-try-for-students/), [Best AI Study Apps 2026 (MyStudyLife)](https://mystudylife.com/the-12-best-ai-study-tools-students-are-using-in-2026-and-how-they-actually-help-you-learn-faster/)

---

## 7. Recommendations: High Priority (Highest Impact)

### 7.1 Spaced Repetition Engine for Flashcards

**What:** Implement an FSRS-based (Free Spaced Repetition Scheduler) scheduling system for FlashcardNodes. When a student reviews a flashcard and rates their recall (Again / Hard / Good / Easy), the algorithm calculates the optimal next review time. Cards due for review surface automatically.

**Why this is worth it:**
- Spaced repetition is the single most evidence-backed learning technique. It reduces required reviews by 20-30% compared to naive repetition while achieving the same or better retention.
- Every serious competitor has it (Quizlet, RemNote, Anki). Its absence is the single biggest functional gap.
- Students who use spaced repetition consistently outperform those who don't. This is the feature most likely to make students feel they're "revising better."

**How it leverages the canvas:**
- **Spatial Review Mode**: When it's time to review, due flashcards could glow/pulse on the canvas, drawing the student's eye to them spatially. The student sees where in their knowledge tree the gaps are.
- **Heat Map Overlay**: Canvas regions with many "due" or "struggling" flashcards light up in warm colours. Students visually see which areas of their document they need to revisit.
- **Review Queue Node**: A special node that collects all due flashcards into a focused review session, right on the canvas. After review, cards scatter back to their spatial positions.

**Competitor comparison:**
- Quizlet: Has spaced repetition but no spatial context. Cards are in flat lists.
- RemNote: Uses FSRS but in a linear outline view. No visual "heat map" of knowledge gaps.
- StudyCanvas advantage: The only tool where spaced repetition is **spatial** -- students see where their weak points are on the canvas.

**Technical approach:**
- Use the `ts-fsrs` npm package (TypeScript FSRS implementation) for scheduling calculations.
- Store per-card FSRS state (difficulty, stability, retrievability, due date) in FlashcardNodeData.
- Add a `dueDate` field and review rating UI (Again/Hard/Good/Easy buttons on card flip).
- Review scheduling runs entirely client-side -- no backend changes needed.
- Persist review history in canvasStore/localStorage.

**Implementation scope:** Medium -- primarily frontend. New fields in FlashcardNodeData, review UI on FlashcardNode, FSRS scheduling logic, due-card highlighting.

---

### 7.2 Revision Dashboard / Progress Analytics

**What:** A canvas-level analytics panel showing the student's revision progress: mastery breakdown, topic-by-topic performance, quiz score trends, flashcard retention rates, study time distribution, and struggling areas.

**Why this is worth it:**
- Students consistently rank progress tracking as a top need. 78% of students using AI tools report better outcomes when tools provide performance feedback.
- The node status system (understood/struggling/unread) already collects the raw data. Currently it's just coloured borders -- there's no aggregated view.
- Metacognitive awareness ("knowing what you know") is one of the three pillars of effective revision. An analytics dashboard directly serves this.
- This is the difference between "I studied for 3 hours" and "I've mastered 73% of Chapter 4 but am struggling with sections on thermodynamics."

**How it leverages the canvas:**
- **Mastery Map**: An overlay mode where nodes dim/brighten based on mastery level. The canvas becomes a literal map of knowledge.
- **Topic Clusters**: Group nodes by topic/page and show per-cluster mastery percentages.
- **Timeline View**: Show how mastery has changed over study sessions.
- **Session Summary**: After a study session, display a brief summary: "You reviewed 12 flashcards, answered 5 quiz questions, and moved 3 topics from struggling to understood."

**Competitor comparison:**
- Quizlet: Shows simple progress bars per study set.
- RemNote: Tracks flashcard retention statistics.
- Neither offers spatial/visual mastery mapping.
- StudyCanvas advantage: Progress is visible **on the canvas** as a spatial heat map, not just in a separate stats page.

**Technical approach:**
- Aggregate data from existing node statuses, quiz scores (from RevisionModal), flashcard review outcomes.
- Store session history (timestamps, actions, score changes) in a new `analyticsStore` or extend `usageStore`.
- Build a Dashboard panel (slide-in or modal) with charts (use a lightweight library like recharts or Chart.js).
- Add mastery overlay mode to Canvas.tsx using node opacity/border modifications.

**Implementation scope:** Medium -- primarily frontend. Data already exists in node statuses; needs aggregation, storage, and visualisation.

---

### 7.3 Smart Revision Planner (AI-Powered Study Session Builder)

**What:** An AI-powered feature that analyses the student's canvas -- their node statuses, quiz scores, flashcard due dates, time since last review -- and generates a personalised revision plan: "Today, focus on these 5 flashcards, re-read page 3 (you scored 40% on the quiz), and try these 3 practice questions on the topics you're struggling with."

**Why this is worth it:**
- Research shows students often "believe relatively ineffective strategies are actually the most effective." They need guidance on *what* to study, not just tools to study with.
- This addresses the metacognitive gap: students don't know what they don't know.
- It directly answers the question every student has at the start of a revision session: "What should I work on right now?"
- This would be a genuinely differentiating feature -- no competitor offers AI-generated revision plans from spatial canvas analysis.

**How it leverages the canvas:**
- The planner analyses the spatial arrangement: which areas have dense struggling nodes, which pages haven't been visited, which flashcards are overdue.
- It could highlight a "study path" on the canvas -- a suggested route through the material.
- After completing the planned session, the student sees their progress update spatially.

**Competitor comparison:**
- No competitor offers this from a spatial canvas. Quizlet's Learn mode auto-selects cards but doesn't plan cross-material sessions. NotebookLM can summarise but doesn't plan revision.
- This would be a first-in-market feature for spatial study planning.

**Technical approach:**
- Backend: New Gemini-powered endpoint `/api/revision-plan` that receives canvas state summary (node statuses, quiz scores, flashcard due dates, time data) and returns a structured plan.
- Frontend: Revision Planner panel that displays the plan as a checklist, with "Focus" buttons that pan the canvas to the relevant area.
- Uses MODEL_LITE for plan generation (structured output, not complex reasoning).

**Implementation scope:** Medium -- new backend endpoint + frontend panel. The intelligence comes from aggregating existing canvas data and feeding it to Gemini.

---

### 7.4 Confidence-Based Self-Assessment on Answer Nodes

**What:** After reading an AI answer, the student rates their confidence: "Got it" / "Mostly" / "Not sure" / "Lost". This feeds into the revision planner and analytics. Currently nodes only have Understood/Struggling -- this adds nuance.

**Why this is worth it:**
- Binary understood/struggling is too coarse. A student might understand the basics but not the nuances. Granular self-assessment improves metacognitive accuracy.
- This data powers the spaced repetition and revision planner: items marked "Not sure" get scheduled for sooner review than "Mostly."
- It's extremely low friction -- just 4 buttons after reading an answer. Takes 1 second.
- Converts passive reading into active engagement with the material.

**How it leverages the canvas:**
- Confidence levels could map to visual intensity: "Got it" nodes are bright, "Lost" nodes are dim or highlighted in red. The canvas becomes a confidence heat map.
- The revision planner prioritises low-confidence areas.

**Competitor comparison:**
- Quizlet and RemNote have this on flashcards (Again/Hard/Good/Easy) but not on Q&A answers.
- StudyCanvas would be the only tool with confidence tracking on AI-generated answers, making the knowledge tree itself a progress indicator.

**Technical approach:**
- Add `confidence: 'got_it' | 'mostly' | 'not_sure' | 'lost'` to AnswerNodeData.
- 4-button row on AnswerNode (below the answer text). Updates via `updateNodeData()`.
- Feed confidence data into FSRS scheduling (map confidence to FSRS rating) and analytics.

**Implementation scope:** Small -- UI addition to AnswerNode, new field in types/index.ts.

---

## 8. Recommendations: Medium Priority

### 8.1 Canvas-Level Knowledge Map / Mind Map View

**What:** A toggle-able overlay that transforms the canvas into a mind-map-style view: nodes are repositioned by topic/concept relationships, with connecting lines showing how ideas relate. Students can switch between "free arrangement" (current) and "knowledge map" (auto-arranged by topic).

**Why this is worth it:**
- Mind mapping is one of the top revision techniques. Dual coding (visual + verbal) is well-evidenced.
- The canvas already has edges connecting nodes, but they represent "question spawned from highlight." A knowledge map view would show **conceptual** relationships.
- Students using mind maps report better understanding of how concepts relate, which improves exam performance on analysis and application questions.

**How it leverages the canvas:**
- This IS the canvas. It transforms the existing canvas from a question-tree into a concept-map at the flip of a toggle.
- Leverages React Flow's built-in layout algorithms (dagre, elkjs).

**Competitor comparison:**
- RemNote has a knowledge graph but it's auto-generated from backlinks -- not user-controllable.
- No competitor lets you switch between free-form spatial arrangement and structured mind-map view.

**Technical approach:**
- Use `@dagrejs/dagre` or `elkjs` for auto-layout calculation.
- Add a toggle button in the canvas toolbar.
- When activated, calculate new positions for all nodes and animate them into place (React Flow supports animated position changes).
- Allow manual adjustment after auto-layout.
- Store both "free" and "map" positions so switching is non-destructive.

**Implementation scope:** Medium -- layout algorithm integration, position animation, dual-position storage.

---

### 8.2 "Focus Mode" for Distraction-Free Revision

**What:** A dedicated revision mode that:
- Hides all non-essential UI (toolbar, navigation, controls)
- Dims/hides nodes not in the current study focus
- Highlights only the nodes queued for review (from the revision planner or spaced repetition queue)
- Shows a progress bar ("3 of 12 items reviewed")
- Integrates with the Pomodoro timer
- Blocks the urge to wander (soft-locks canvas panning to the study area)

**Why this is worth it:**
- Focus/distraction management is consistently ranked in the top 3 student needs during revision.
- The canvas is large and can be overwhelming. Students may get lost exploring rather than systematically reviewing.
- Focus mode converts the canvas from an "exploration tool" into a "revision machine" with a single toggle.
- Combines with spaced repetition: focus mode walks the student through their due items sequentially.

**How it leverages the canvas:**
- Uses React Flow's viewport controls to smoothly pan between focus items.
- Dimming non-focus nodes uses existing node styling (opacity changes).
- The Pomodoro timer (already a node) could auto-trigger focus mode when started.

**Competitor comparison:**
- Forest and Opal are separate apps just for focus. No competitor integrates focus mode into the study tool itself.
- StudyCanvas would be the first to offer a focus mode that spatially navigates you through your revision material.

**Technical approach:**
- Add `focusMode: boolean` to canvasStore.
- When active: set opacity on non-focus nodes, hide LeftToolbar, show progress HUD.
- Navigate between focus items using `reactFlowInstance.fitView({ nodes: [currentNode] })`.
- Exit focus mode shows session summary (ties into analytics).

**Implementation scope:** Medium -- primarily frontend state + styling. No backend changes.

---

### 8.3 LaTeX / Mathematical Notation Rendering

**What:** Support LaTeX rendering in AnswerNodes, FlashcardNodes, QuizQuestionNodes, and StickyNoteNodes. When Gemini returns mathematical notation (equations, formulas, Greek letters), render them properly instead of showing raw LaTeX syntax.

**Why this is worth it:**
- STEM students are a major user segment. Currently, any math-heavy subject (physics, chemistry, engineering, statistics) produces ugly raw LaTeX in answers.
- Revizly specifically calls out LaTeX support as a key feature. It's a hygiene factor for STEM users.
- This isn't a "nice-to-have" -- it's a dealbreaker for a significant portion of the target audience. A physics student seeing `\frac{d^2x}{dt^2} = -\omega^2 x` instead of the rendered equation will leave.

**How it leverages the canvas:**
- Beautifully rendered equations on the spatial canvas make it a genuine alternative to pen-and-paper revision for STEM subjects.
- Flashcards with proper math notation are actually usable for formula memorisation.

**Competitor comparison:**
- Revizly: Has LaTeX rendering.
- NotebookLM: Renders math inline.
- RemNote: Supports LaTeX in notes.
- StudyCanvas: Currently shows raw LaTeX strings. Falling behind.

**Technical approach:**
- Use `react-katex` or `better-react-mathjax` for rendering.
- Add a markdown-to-LaTeX detection pass in the content rendering pipeline.
- Gemini already returns LaTeX when asked math questions -- just need rendering.
- Apply to: AnswerNode content, FlashcardNode front/back, QuizQuestionNode question/feedback, SummaryNode content.

**Implementation scope:** Small-Medium -- library integration + content rendering updates across node components.

---

### 8.4 YouTube Video / Web URL Import

**What:** Allow students to paste a YouTube URL or web article URL, extract the content (transcript or article text), and create a ContentNode from it on the canvas. All existing features (Q&A, quiz, flashcards) then work on this content.

**Why this is worth it:**
- Students don't only learn from PDFs. Lecture recordings on YouTube, blog posts, documentation pages are all common study material.
- NotebookLM and Mindgrasp both support multi-format input. This is a competitive gap.
- Students currently have to manually copy-paste web content into sticky notes. Removing this friction makes StudyCanvas the single place for all revision material.
- Low hanging fruit: YouTube transcripts are freely available via API; web articles can be extracted with existing tools.

**How it leverages the canvas:**
- A YouTube node or Web node becomes another spatial element on the canvas. Students can place a video lecture next to a textbook PDF, highlight text from the transcript, and build Q&A trees from both sources.
- Cross-source connections become visible spatially.

**Competitor comparison:**
- NotebookLM: Supports YouTube, websites, Google Docs, Slides.
- Mindgrasp: Supports YouTube, audio, websites, articles.
- StudyCanvas: PDF/DOCX/PPTX only. Significantly behind on input versatility.

**Technical approach:**
- Backend: New endpoint `/api/import-url` that accepts a URL, detects type (YouTube vs article), extracts content.
  - YouTube: Use `youtube-transcript-api` Python package for transcripts.
  - Web articles: Use `trafilatura` or `readability-lxml` for article extraction.
- Frontend: New "Import URL" button in toolbar or upload popup. Creates ContentNode with extracted text as markdown.
- All existing Q&A, quiz, flashcard features work automatically on the extracted content.

**Implementation scope:** Medium -- new backend endpoint + extraction libraries + frontend UI.

---

### 8.5 Exam Countdown & Study Schedule Integration

**What:** Let students set exam dates for each canvas. The app then:
- Shows a countdown ("12 days until Biology exam")
- Distributes revision across available days (backloaded: lighter early, heavier closer to exam)
- Suggests daily study targets based on unmastered material
- Integrates with the revision planner: "You have 4 pages unreviewed and 23 flashcards due. At this pace, you'll finish 2 days before the exam."

**Why this is worth it:**
- Structured study planning is the #4 student need during revision. Students procrastinate when they can't see the timeline.
- An exam countdown creates urgency. A study schedule creates accountability.
- The combination of "here's when your exam is" + "here's what you haven't mastered" + "here's your daily plan" is extremely powerful for motivation.
- No competitor integrates exam scheduling with AI-powered revision planning on a spatial canvas.

**How it leverages the canvas:**
- The countdown could be a persistent header bar or a special node.
- Daily study targets highlight specific canvas regions to focus on.
- As the exam approaches, the dashboard shows mastery trajectory: "At current pace, you'll master 85% by exam day."

**Competitor comparison:**
- RemNote has an exam scheduler but it only schedules flashcard reviews.
- No competitor combines exam countdown + spatial canvas analysis + AI revision planning.

**Technical approach:**
- Add `examDate: string | null` to canvas metadata in canvasStore.
- Frontend: Exam date picker in canvas settings. Countdown display in top bar.
- Integrate with revision planner: divide unmastered material by days remaining.
- Simple time-based calculations -- no AI needed for the scheduling itself.

**Implementation scope:** Small-Medium -- primarily frontend. No backend changes.

---

## 9. Recommendations: Lower Priority (Nice-to-Have)

### 9.1 Study Streaks & Light Gamification

**What:** Track consecutive days of study and display a streak counter. Add achievement badges for milestones (e.g., "Reviewed 100 flashcards," "Mastered all of Chapter 3," "7-day streak"). Optional daily study goals.

**Why this is worth it:**
- Gamification keeps students returning daily. Quizlet's match games and streaks are a major retention driver.
- Streaks create a psychological commitment: "I don't want to break my 14-day streak."
- But beware: heavy gamification can feel childish for university students. Keep it subtle and optional.

**How it leverages the canvas:** Streak counter in the top bar. Achievement badges could appear as small icons on mastered nodes.

**Competitor comparison:** Quizlet has extensive gamification. Most others don't. A lightweight version would differentiate without over-investing.

**Implementation scope:** Small -- localStorage date tracking, UI counter, optional achievement definitions.

---

### 9.2 Audio Overview / Podcast Generation

**What:** Generate a podcast-style audio summary of a canvas's content using text-to-speech, similar to NotebookLM's Audio Overviews. The AI creates a conversational script summarising key points, then renders it as audio.

**Why this is worth it:**
- NotebookLM's Audio Overviews is widely cited as its killer feature. Students listen during commutes, exercise, or while doing chores.
- Passive revision (listening) complements active revision (quizzing). Different modes suit different contexts.
- However, this is technically complex and expensive (TTS API costs, long audio generation). It's impressive but not core to revision effectiveness.

**How it leverages the canvas:** Generates the script from canvas content (PDF text + AI answers + sticky notes). A play button on the canvas triggers audio.

**Competitor comparison:** Only NotebookLM has this. It's a differentiator, but expensive to replicate.

**Implementation scope:** Large -- requires TTS API integration, script generation prompt engineering, audio player UI.

---

### 9.3 Collaborative Canvas (Real-Time Multi-User)

**What:** Multiple students can work on the same canvas simultaneously, seeing each other's cursors, nodes, and annotations in real-time.

**Why this is worth it:**
- Group study is common. Students revise together before exams.
- However, this is extremely complex (CRDT or OT for conflict resolution, WebSocket infrastructure, user authentication).
- Most competitors don't have this either (NotebookLM recently added "View Only" sharing, not editing).
- Build the core product first. Collaboration can come later.

**Implementation scope:** Very Large -- requires WebSocket server, CRDT library (Yjs), authentication, permissions.

---

### 9.4 Mobile-Responsive Canvas

**What:** Optimise the canvas experience for tablet and mobile devices. The infinite canvas is inherently desktop-first, but students review flashcards and do quick quizzes on their phones.

**Why this is worth it:**
- Cross-device access is a top student need. But a full canvas on mobile is impractical.
- Better approach: a **mobile companion mode** that shows only flashcard review and quiz practice (no full canvas). The canvas remains desktop-focused.
- This addresses "review on the go" without compromising the spatial experience.

**Implementation scope:** Medium-Large for full responsive canvas. Small-Medium for a flashcard/quiz-only mobile view.

---

## 10. React Flow Performance Considerations

As features are added, the canvas will hold more nodes. Here are critical performance practices to follow:

### Current Good Practices (Keep Doing)
- Node components wrapped with `React.memo` -- good
- Callbacks memoised with `useCallback` -- good
- NODE_TYPES defined outside component -- good

### Recommended Optimisations

1. **Enable `onlyRenderVisibleElements`** on the ReactFlow component. This virtualises off-screen nodes, dramatically improving performance for canvases with 50+ nodes. This is a one-line change with massive impact.

2. **Avoid subscribing to the full `nodes` array** in components. If a component only needs selected node IDs, select that specific data from the store rather than filtering the full array.

3. **Batch state updates** when adding multiple nodes simultaneously (e.g., quiz generation adds 5+ nodes). Use a single `setNodes` call rather than sequential calls.

4. **Simplify node CSS for performance.** Complex shadows, gradients, and animations on 50+ nodes add up. Consider reducing visual complexity on nodes when zoomed out (LOD - level of detail).

5. **Throttle `onNodeDrag` handlers.** Node dragging triggers frequent state updates. Throttle position persistence to every 100ms rather than every frame.

6. **Consider lazy loading for heavy node components.** CodeEditorNode (CodeMirror) and CalculatorNode are heavy. Use `React.lazy` + `Suspense` to load them only when first used.

**Source:** [React Flow Performance Guide](https://reactflow.dev/learn/advanced-use/performance), [Synergy Codes Optimisation Guide](https://www.synergycodes.com/blog/guide-to-optimize-react-flow-project-performance)

---

## 11. Summary Matrix

| # | Recommendation | Priority | Effort | Impact on Revision | Unique to Canvas? | Competitor Gap Closed |
|---|---------------|----------|--------|--------------------|--------------------|----------------------|
| 7.1 | Spaced Repetition (FSRS) | **Highest** | Medium | **Critical** -- most evidence-backed technique | Yes (spatial SRS) | Quizlet, RemNote |
| 7.2 | Progress Analytics Dashboard | **High** | Medium | **High** -- metacognitive awareness | Yes (mastery heat map) | Quizlet, RemNote |
| 7.3 | AI Revision Planner | **High** | Medium | **High** -- solves "what to study now" | Yes (spatial study path) | None (first-in-market) |
| 7.4 | Confidence Self-Assessment | **High** | Small | **High** -- granular self-knowledge | Yes (confidence heat map) | Partial (Quizlet cards) |
| 8.1 | Knowledge Map / Mind Map View | Medium | Medium | **Medium** -- dual coding, concept relationships | Yes (toggle view) | RemNote (partial) |
| 8.2 | Focus Mode | Medium | Medium | **Medium** -- distraction management | Yes (spatial navigation) | None (integrated focus) |
| 8.3 | LaTeX Rendering | Medium | Small | **High for STEM** -- dealbreaker without it | No | Revizly, RemNote |
| 8.4 | YouTube / URL Import | Medium | Medium | **Medium** -- expands material types | No | NotebookLM, Mindgrasp |
| 8.5 | Exam Countdown + Schedule | Medium | Small | **Medium** -- urgency + planning | Yes (canvas-aware schedule) | RemNote (partial) |
| 9.1 | Study Streaks & Gamification | Lower | Small | **Low-Medium** -- retention driver | No | Quizlet |
| 9.2 | Audio Overviews / Podcast | Lower | Large | **Low-Medium** -- passive revision | No | NotebookLM |
| 9.3 | Collaborative Canvas | Lower | Very Large | **Low** -- group study | No | None significant |
| 9.4 | Mobile Companion Mode | Lower | Medium | **Medium** -- on-the-go review | Partially | All competitors |

---

## Final Strategic Note

The recommended implementation order maximises impact while building on each feature:

1. **Confidence Self-Assessment** (7.4) -- smallest effort, provides data foundation
2. **Spaced Repetition** (7.1) -- uses confidence data, biggest single improvement
3. **Progress Analytics** (7.2) -- visualises SRS + confidence data
4. **AI Revision Planner** (7.3) -- uses all above data to generate study plans
5. **LaTeX Rendering** (8.3) -- quick win, unlocks STEM users
6. **Focus Mode** (8.2) -- integrates with SRS + planner for guided sessions
7. **Remaining features** in any order based on user feedback

Each feature builds on the previous one, creating a compounding effect. By the time all high-priority features are implemented, StudyCanvas will be the only tool that combines spatial learning, spaced repetition, AI-powered revision planning, and progress analytics in a single canvas -- a genuinely unique product with no direct competitor.

---

*Research compiled from codebase analysis (14 node types, 16 backend endpoints, 3 state stores) and competitive analysis of NotebookLM, Quizlet, RemNote, Mindgrasp, and Revizly. Evidence-based revision science from cognitive psychology research on spaced repetition, active recall, dual coding, and metacognition.*
