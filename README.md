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
| **Page Comprehension Checks** | Generate 3–5 short-answer questions on any individual page with instant, personalised feedback. |
| **Revision Quiz Mode** | Generate a personalised mixed MCQ + short-answer quiz from struggling nodes or the current page. |
| **Flashcard Mode** | Turn struggling nodes or the current page into flashcards for rapid-fire review. |
| **AI Answer Validation** | Short-answer quiz responses are graded by Gemini with constructive feedback. MCQ answers are validated instantly client-side. |
| **Handwriting & Vision Support** | Quiz/flashcard generation always includes a rendered page image so Gemini can read handwritten notes, annotations, and diagrams that text extraction misses. |
| **OCR Snipping Tool** | Draw a rectangle over any region of the PDF (Ctrl+Shift+S) to extract text via Gemini Vision and auto-ask a question about it. |
| **Streaming Responses** | All AI answers stream token-by-token using `fetch` + `ReadableStream` with a cancel button. |
| **Folder & Canvas Management** | Organise canvases in folders. Name prompts on creation prevent accidental duplicates. |
| **Local File Persistence** | Canvas state and PDFs are saved to a local folder you choose via the File System Access API. |
| **Rate Limiting** | All heavy LLM routes are rate-limited with `slowapi` to protect against abuse. |
| **Vercel Analytics** | Built-in Vercel Analytics and Speed Insights for production performance monitoring. |

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
| Analytics | @vercel/analytics + @vercel/speed-insights |
| Backend | Python 3.12 + FastAPI |
| PDF Extraction | pypdf (Vercel / production) · pymupdf4llm (local dev, optional) |
| AI Models | Gemini 2.5 Flash + Gemini 2.5 Flash Lite via `google-generativeai` |
| Rate Limiting | slowapi |
| Deployment | Vercel (frontend static + Python serverless function) |

---

## Project Structure

```
StudyCanvas/
├── .python-version             # Python 3.12 — read by Vercel to pin runtime
├── vercel.json                 # Vercel config: build command, routes, function runtime
├── requirements.txt            # Python dependencies (pypdf, FastAPI, Gemini SDK)
├── api/
│   └── index.py                # Vercel serverless entry — re-exports FastAPI `app`
├── backend/                    # FastAPI Python backend
│   ├── main.py                 # App entry point, CORS, router registration
│   ├── rate_limiter.py         # slowapi limiter with real-IP extraction
│   ├── models/
│   │   └── schemas.py          # Pydantic request/response models
│   ├── routes/
│   │   ├── upload.py           # POST /api/upload & /api/upload-text — PDF ingestion
│   │   ├── query.py            # POST /api/query (streaming) & /api/generate-title
│   │   ├── quiz.py             # POST /api/quiz & /api/validate
│   │   ├── flashcards.py       # POST /api/flashcards
│   │   ├── page_quiz.py        # POST /api/page-quiz & /api/grade-answer
│   │   └── ocr.py              # POST /api/vision — Gemini Vision OCR
│   └── services/
│       ├── gemini_service.py   # All Gemini API calls (quiz, flashcards, grading, OCR)
│       ├── pdf_service.py      # PDF text extraction + ligature/encoding correction
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
        │   ├── CanvasCard.tsx          # Canvas thumbnail card
        │   ├── FolderCard.tsx          # Folder card with drop target
        │   ├── CanvasPage.tsx          # Route wrapper: load/save/autosave canvas
        │   ├── Canvas.tsx              # Main ReactFlow canvas + all handlers
        │   ├── ContentNode.tsx         # PDF content node (text + PDF viewer tabs)
        │   ├── AnswerNode.tsx          # Q&A answer node with status tracking
        │   ├── QuizQuestionNode.tsx    # Page quiz node with grading
        │   ├── FlashcardNode.tsx       # Flashcard node (flip animation)
        │   ├── AskGeminiPopup.tsx      # Floating "Ask Gemini" popup on text select
        │   ├── QuestionModal.tsx       # Full question input modal
        │   ├── RevisionModal.tsx       # Revision quiz modal (MCQ + short-answer)
        │   ├── PdfUploadPopup.tsx      # PDF upload popup with drag-and-drop
        │   ├── ModelIndicator.tsx      # Shows which Gemini model was used
        │   ├── OnboardingModal.tsx     # First-run user details form
        │   ├── ToolsModal.tsx          # User context / settings modal
        │   ├── StudyNotePDF.tsx        # PDF export component (@react-pdf/renderer)
        │   └── PDFViewer/
        │       ├── index.ts
        │       └── PDFViewer.tsx       # pdf.js page renderer + snipping tool
        ├── hooks/
        │   └── useTextSelection.ts     # Text selection detection hook
        ├── services/
        │   └── fileSystemService.ts    # File System Access API wrappers
        ├── store/
        │   ├── appStore.ts             # App-level state (canvas list, folders, auth)
        │   └── canvasStore.ts          # Canvas-level state (nodes, edges, PDF data)
        ├── types/
        │   └── index.ts                # Shared TypeScript types
        └── utils/
            ├── buildQATree.ts          # Builds Q&A tree for PDF export
            ├── pdfImageExtractor.ts    # Renders PDF page → base64 JPEG (pdf.js)
            ├── pdfStorage.ts           # IndexedDB helpers for PDF binary caching
            ├── pdfTextExtractor.ts     # Client-side PDF text extraction (pdf.js)
            └── positioning.ts         # Node placement & overlap-prevention helpers
```

---

## Prerequisites

- **Node.js** v18+ and **npm** v9+
- **Python 3.12** (exact — Vercel pins to 3.12 via `.python-version`)
- A **Google Gemini API key** — get one free at [aistudio.google.com](https://aistudio.google.com)

---

## Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/AkshayReddyGujjula/StudyCanvas.git
cd StudyCanvas
```

### 2. Backend setup

```bash
# Create and activate a virtual environment in the root directory
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

## Deploying to Vercel

The project is pre-configured for one-click Vercel deployment. The frontend (React/Vite) is built as static files and the backend (FastAPI) runs as a Python 3.12 serverless function.

### 1. Import the repository

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repository.
2. Vercel will auto-detect the `vercel.json` configuration — **no framework preset changes needed**.

### 2. Set environment variables

In the Vercel project dashboard navigate to **Settings → Environment Variables** and add:

| Variable | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Your Google Gemini API key | **Required** — the backend will not work without it |
| `ALLOWED_ORIGINS` | Your production URL (e.g. `https://your-app.vercel.app`) | Optional — the CORS regex already permits `*.vercel.app` subdomains. Set this for custom domains. |

### 3. Deploy

Click **Deploy**. Vercel will:
1. Install frontend dependencies and build the React app (`cd frontend && npm install && npm run build`)
2. Bundle the Python 3.12 serverless function from `api/index.py` with `requirements.txt`
3. Route `/api/*` requests to the serverless function and everything else to the SPA

### Architecture notes

- **Python version** is pinned to 3.12 via `.python-version` (read by Vercel's `@vercel/python` builder) and explicitly declared as `"runtime": "python3.12"` in `vercel.json`.
- **PDF extraction** uses `pypdf` (pure Python, no native binaries) on Vercel. The optional `pymupdf4llm` library ships ~150 MB of native binaries which exceed Vercel's 250 MB Lambda limit — excluded from `requirements.txt`. Install it locally if you want higher-quality Markdown extraction (`pip install pymupdf4llm`); `pdf_service.py` auto-detects it at runtime.
- **Large PDF uploads** (> 4 MB) are handled client-side: the frontend extracts text via pdf.js and POSTs it as JSON to `/api/upload-text`, staying under Vercel's 4.5 MB request body limit.
- **Handwriting & image content** — quiz, flashcard, and revision quiz generation always sends the rendered page image alongside extracted text. Gemini reads handwritten notes and annotations directly from the image, preventing nonsense questions when text extraction misses handwritten content.
- **Streaming AI** responses use FastAPI's `StreamingResponse` over ASGI.
- **Rate limiting** uses `slowapi` with in-memory storage. On serverless, rate state resets per cold start — this still provides flood protection per container lifetime.

---

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `GEMINI_API_KEY` | `backend/.env` (local) · Vercel dashboard (production) | Google Gemini API key — **required** |
| `ALLOWED_ORIGINS` | Vercel dashboard (production only) | Comma-separated allowed CORS origins (optional, defaults to `http://localhost:5173`) |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a PDF (≤ 4 MB); returns Markdown, raw text, page count |
| `POST` | `/api/upload-text` | Upload pre-extracted page text for large PDFs (> 4 MB) |
| `POST` | `/api/query` | Stream AI answer for a highlighted-text question |
| `POST` | `/api/generate-title` | Generate a concise document title from content |
| `POST` | `/api/quiz` | Generate mixed MCQ + short-answer quiz (page or struggling mode) |
| `POST` | `/api/validate` | Validate a quiz answer (short-answer via Gemini, MCQ by index) |
| `POST` | `/api/flashcards` | Generate flashcards (page or struggling mode) |
| `POST` | `/api/page-quiz` | Generate comprehension questions for a single page |
| `POST` | `/api/grade-answer` | Grade a page-quiz answer with personalised feedback |
| `POST` | `/api/vision` | Extract text from a base64 image via Gemini Vision OCR |
| `GET` | `/api/health` | Health check |

---

## License

[MIT](LICENSE)