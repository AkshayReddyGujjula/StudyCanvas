# StudyCanvas

> **Every other AI gives you a conversation. We give you a map of your understanding.**

StudyCanvas is an AI-powered, spatial study tool that transforms your PDF lecture notes and textbooks into an interactive, visual knowledge graph. Instead of scrolling through a linear chat window, you build a tree of understanding directly anchored to your source material — on an infinite, zoomable canvas.

---

## The Problem

Traditional AI study tools give you a chatbot. You ask a question, get a wall of text, lose your place in the original material, and start over. Every clarification creates an ever-longer thread that becomes impossible to navigate.

Worse, your actual source material — the lecture slides, the textbook chapter — lives in a separate window, forcing constant context-switching that fractures your concentration and breaks your flow.

---

## The Solution

StudyCanvas makes your document the centrepiece. Upload a PDF and it becomes the **root node** on an infinite canvas. Highlight any passage, click **✨ Ask Gemini**, and your AI-generated answer appears as a **connected node** right next to the text that prompted it. Highlight text inside that answer and ask a follow-up — another connected node branches out. Every question deepens the tree.

The result is a **visual knowledge map** of exactly what you understood, what confused you, and how the concepts connect — all anchored to the original material.

---

## Features

| Feature | Description |
|---|---|
| **PDF Upload & Rendering** | Upload any PDF. Text is extracted locally with pypdf, converted to clean Markdown, and rendered as the central canvas node. |
| **Highlight & Ask** | Select any text on the canvas and ask Gemini a question. The answer streams in real time as a connected node beside the highlighted passage. |
| **Branching Q&A Tree** | Ask follow-up questions on any answer. Each response spawns a new node, building a visual tree of understanding. |
| **Page Comprehension Checks** | Generate 2–4 adaptive questions on any individual page with instant, personalised feedback. Gemini intelligently scales the count to the richness of the page content. |
| **Revision Quiz Mode** | Generate a personalised mixed MCQ + short-answer quiz from struggling nodes or the current page. |
| **Flashcard Mode** | Turn struggling nodes or the current page into AI-generated flashcards for rapid-fire review. |
| **Custom Flashcard Node** | Create blank flashcards manually from the left toolbar. Each side is independently edited via an inline edit mode — click the pencil icon to type, click the checkmark to save. |
| **AI Answer Validation** | Short-answer quiz responses are graded by Gemini with constructive feedback. MCQ answers are validated instantly client-side. |
| **Custom Prompt Node** | Drop a freeform AI chat node onto the canvas from the left toolbar. Page context is enabled by default — toggle it off or switch between Gemini Flash and Flash Lite per-node. |
| **Page Summary Node** | One-click streaming summary of the current page, placed as a canvas node for at-a-glance review. |
| **Sticky Note Nodes** | Add coloured sticky notes (6 pastel presets) anywhere on the canvas for freeform annotations and reminders. |
| **Image Nodes** | Drag any image file from your computer onto the canvas via the left toolbar. Images are resizable and persist with the canvas save. |
| **Pomodoro Study Timer** | Drop a timer node onto the canvas with Pomodoro, short-break, and long-break modes. Tracks completed sessions and supports custom durations. |
| **Left Toolbar** | Quick-access toolbar to insert any node type: custom prompt, image, custom flashcard, sticky note, voice note, timer, or page summary. |
| **Canvas Export (Save This Page)** | Export the entire canvas as a high-resolution PNG/PDF screenshot. Automatically fits all nodes into the frame with extra padding so no content is clipped. |
| **Handwriting & Vision Support** | Quiz/flashcard generation always includes a rendered page image so Gemini can read handwritten notes, annotations, and diagrams that text extraction misses. |
| **OCR Snipping Tool** | Draw a rectangle over any region of the canvas (Ctrl+Shift+S) to extract text via Gemini Vision and auto-ask a question about it. |
| **Whiteboard & Drawing Tools** | Full drawing overlay with dual pens, highlighter, stroke & area erasers, text tool, and undo/redo — draw anywhere on the canvas or directly on PDF nodes. |
| **Color Picker with Drag-to-Delete** | Choose from preset colors or enter custom hex values. Drag a color swatch to the trash bin to remove it. |
| **Node-Attached Annotations** | Strokes drawn on a PDF/content node automatically attach to it — when the node moves, annotations follow. |
| **Right-Click Pan** | Right-click and drag anywhere on the canvas to pan — works in every tool mode for quick navigation without switching tools. |
| **Resize Warning for Annotated Nodes** | If you try to resize a node with drawing annotations, a safety warning appears to prevent accidental annotation displacement. |
| **PDF Viewer Lock & Quality** | Lock a PDF node to prevent accidental dragging/resizing. Adjust the rendering resolution (DPR) via a quality slider for crisp or fast rendering. |
| **Interactive Walkthrough** | A game-style interactive tutorial guides new users through every core feature. |
| **Dual Model Tiers** | Every AI response includes a model indicator badge. Complex/analytical queries automatically route to Gemini 2.5 Flash; simpler tasks use the faster Flash Lite. |
| **Streaming Responses** | All AI answers stream token-by-token using `fetch` + `ReadableStream` with a cancel button. |
| **Folder & Canvas Management** | Organise canvases in folders. Name prompts on creation prevent accidental duplicates. |
| **Local File Persistence** | Canvas state and PDFs are saved to a local folder you choose via the File System Access API. |
| **Rate Limiting** | All heavy LLM routes are rate-limited with `slowapi` to protect against abuse. |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `F` | Fit all nodes into view |
| `Ctrl + S` | Save canvas |
| `Ctrl + Shift + S` | Toggle snipping tool |
| `Ctrl + Space` | Switch to cursor mode from any tool |
| `Esc` | Exit snipping mode |
| `Ctrl + Z` | Undo whiteboard stroke |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Redo whiteboard stroke |
| `Backspace` / `Delete` | Delete selected node (cursor mode) |
| Right-click + drag | Pan the canvas (works in all tool modes) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 |
| Canvas | @xyflow/react (React Flow v12) |
| Styling | Tailwind CSS v3 + @tailwindcss/typography |
| State Management | Zustand v5 |
| Local Persistence | File System Access API + IndexedDB |
| Routing | React Router v7 |
| Markdown Rendering | react-markdown + remark-gfm + rehype-raw + rehype-sanitize |
| HTTP — streaming | Native Fetch API + ReadableStream + AbortController |
| HTTP — upload / quiz | Axios |
| PDF Rendering | @react-pdf-viewer/core + pdf.js |
| PDF Export | @react-pdf/renderer |
| Screenshot Export | html-to-image + jsPDF |
| Backend | Python 3.12 + FastAPI |
| PDF Extraction | pypdf · pymupdf4llm (local dev, optional) |
| Office Conversion | python-docx + python-pptx + ReportLab (Vercel) · Microsoft Office COM (Windows local) |
| AI Models | Gemini 2.5 Flash + Gemini 2.5 Flash Lite via `google-genai` |
| Rate Limiting | slowapi |

---

## Project Structure

```
StudyCanvas/
├── requirements.txt            # Python dependencies
├── backend/                    # FastAPI Python backend
│   ├── main.py                 # App entry point, CORS, router registration
│   ├── rate_limiter.py         # slowapi limiter
│   ├── models/
│   │   └── schemas.py          # Pydantic request/response models
│   ├── routes/
│   │   ├── upload.py           # POST /api/upload & /api/upload-text — PDF ingestion
│   │   ├── query.py            # POST /api/query (streaming) & /api/generate-title
│   │   ├── quiz.py             # POST /api/quiz & /api/validate
│   │   ├── flashcards.py       # POST /api/flashcards
│   │   ├── page_quiz.py        # POST /api/page-quiz & /api/grade-answer
│   │   ├── ocr.py              # POST /api/vision — Gemini Vision OCR
│   │   └── convert.py          # POST /api/convert-to-pdf — DOCX/PPTX → PDF
│   └── services/
│       ├── gemini_service.py   # All Gemini API calls (quiz, flashcards, grading, OCR)
│       ├── pdf_service.py      # PDF text extraction + ligature/encoding correction
│       ├── conversion_service.py # DOCX/PPTX → PDF (Office COM → LibreOffice → ReportLab)
│       └── file_service.py     # Temp file management
└── frontend/                   # React + Vite frontend
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── public/
    │   └── pdf.worker.min.mjs  # pdf.js worker (served as static asset)
    └── src/
        ├── App.tsx             # Router: / → HomePage, /canvas/:id → CanvasPage
        ├── main.tsx
        ├── index.css
        ├── api/
        │   └── studyApi.ts     # Axios + fetch API wrappers for all endpoints
        ├── components/
        │   ├── HomePage.tsx            # Canvas/folder browser with drag-and-drop
        │   ├── tutorial/               # Interactive Walkthrough components
        │   │   ├── TutorialOverlay.tsx
        │   │   ├── tutorialSteps.ts
        │   │   └── PhaseIcon.tsx
        │   ├── CanvasCard.tsx          # Canvas thumbnail card
        │   ├── FolderCard.tsx          # Folder card with drop target
        │   ├── CanvasPage.tsx          # Route wrapper: load/save/autosave canvas
        │   ├── Canvas.tsx              # Main ReactFlow canvas + all handlers
        │   ├── ContentNode.tsx         # PDF content node (text + PDF viewer tabs)
        │   ├── AnswerNode.tsx          # Q&A answer node with status tracking
        │   ├── QuizQuestionNode.tsx    # Page quiz node with grading
        │   ├── FlashcardNode.tsx       # Flashcard node (flip animation + inline edit)
        │   ├── CustomPromptNode.tsx    # Freeform AI chat node — model picker + context toggle
        │   ├── SummaryNode.tsx         # Streamed one-click page summary node
        │   ├── ImageNode.tsx           # Drag-and-drop image node with resize support
        │   ├── StickyNoteNode.tsx      # Coloured sticky note node (6 pastel presets)
        │   ├── TimerNode.tsx           # Pomodoro timer node (3 modes, custom durations)
        │   ├── LeftToolbar.tsx         # Toolbar: prompt / image / flashcard / sticky / timer / summary
        │   ├── AskGeminiPopup.tsx      # Floating "Ask Gemini" popup on text select
        │   ├── QuestionModal.tsx       # Full question input modal
        │   ├── RevisionModal.tsx       # Revision quiz modal (MCQ + short-answer)
        │   ├── PdfUploadPopup.tsx      # PDF/DOCX/PPTX upload popup with drag-and-drop
        │   ├── ModelIndicator.tsx      # Shows which Gemini model was used
        │   ├── OnboardingModal.tsx     # Tutorial entry point & persistent choice
        │   ├── ToolsModal.tsx          # User context / settings modal
        │   ├── StudyNotePDF.tsx        # PDF export component (@react-pdf/renderer)
        │   ├── PDFViewer/
        │   │   ├── index.ts
        │   │   └── PDFViewer.tsx       # pdf.js page renderer + snipping tool
        │   └── whiteboard/
        │       ├── index.ts
        │       ├── DrawingCanvas.tsx   # HTML5 Canvas drawing overlay (pen, highlighter, eraser)
        │       ├── DrawingToolbar.tsx  # Toolbar with tool selection, settings & undo/redo
        │       ├── ColorPicker.tsx     # Color palette with custom hex & drag-to-delete
        │       └── TextNode.tsx        # Draggable text annotations on the canvas
        ├── hooks/
        │   ├── useTextSelection.ts     # Text selection detection hook
        │   └── useTutorial.ts          # Walkthrough step control
        ├── services/
        │   └── fileSystemService.ts    # File System Access API wrappers
        ├── store/
        │   ├── appStore.ts             # App-level state (canvas list, folders, user)
        │   ├── canvasStore.ts          # Canvas-level state (nodes, edges, PDF data)
        │   └── tutorialStore.ts        # Onboarding progress & persistence
        ├── types/
        │   └── index.ts                # Shared TypeScript types
        └── utils/
            ├── buildQATree.ts          # Builds Q&A tree structure for export
            ├── canvasExport.ts         # Exports the full canvas as PNG or PDF
            ├── pdfImageExtractor.ts    # Renders PDF page → base64 JPEG for Gemini Vision
            ├── pdfStorage.ts           # IndexedDB helpers for PDF binary caching
            ├── pdfTextExtractor.ts     # Client-side PDF text extraction via pdf.js
            └── positioning.ts          # Node placement & overlap-prevention helpers
```

---

## Prerequisites

- **Node.js** v18+ and **npm** v9+
- **Python 3.12**
- A **Google Gemini API key** — get one free at [aistudio.google.com](https://aistudio.google.com)

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/AkshayReddyGujjula/StudyCanvas.git
cd StudyCanvas
```

### 2. Backend setup

```bash
# Create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Create a `.env` file inside the `backend/` directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Start the backend server:

```bash
cd backend
uvicorn main:app --port 8000 --reload
```

The API is now available at `http://localhost:8000`.
Interactive API docs: `http://localhost:8000/docs`

### 3. Frontend setup

Open a **new terminal** from the project root:

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a PDF (≤ 4 MB); returns Markdown, raw text, page count |
| `POST` | `/api/upload-text` | Upload pre-extracted page text for large PDFs (> 4 MB) |
| `POST` | `/api/convert-to-pdf` | Convert a DOCX or PPTX file to PDF |
| `POST` | `/api/query` | Stream AI answer for a highlighted-text question |
| `POST` | `/api/generate-title` | Generate a concise document title from content |
| `POST` | `/api/quiz` | Generate mixed MCQ + short-answer quiz (page or struggling mode) |
| `POST` | `/api/validate` | Validate a quiz answer (short-answer via Gemini, MCQ by index) |
| `POST` | `/api/flashcards` | Generate flashcards (page or struggling mode) |
| `POST` | `/api/page-quiz` | Generate 2–4 adaptive comprehension questions for a single page |
| `POST` | `/api/grade-answer` | Grade a page-quiz answer with personalised feedback |
| `POST` | `/api/vision` | Extract text from a base64 image via Gemini Vision OCR |
| `GET` | `/api/health` | Health check |

---

## License

[MIT](LICENSE)
