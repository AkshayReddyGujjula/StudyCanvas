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
| **PDF Upload & Rendering** | Upload any text-based PDF. It's extracted locally with PyMuPDF, converted to clean Markdown, and rendered as the central canvas node. |
| **Highlight & Ask** | Select any text on the canvas and ask Gemini a question. The answer streams in real time as a connected node beside the highlighted passage. |
| **Branching Q&A Tree** | Ask follow-up questions about any answer. Each response spawns a new node, building a visual tree of understanding that grows as deep as your curiosity. |
| **Adaptive Quiz Mode** | Mark nodes you're struggling with, then generate a personalised quiz. Gemini produces a mix of short-answer and multiple-choice questions from those exact topics. |
| **Flashcard Mode** | Turn struggling nodes into flashcards for rapid-fire review. Each card is generated from the specific text and question context you found difficult. |
| **Page Comprehension Checks** | Generate 3–5 short-answer questions on any individual page and receive instant, personalised feedback on your answers. |
| **AI Answer Validation** | Short-answer quiz responses are graded by Gemini with clear, constructive feedback. MCQ answers are validated instantly. |
| **OCR & Vision Support** | Highlight regions in image-only, scanned, or handwritten PDFs. The system intelligently captures the image context and uses Vision AI for accurate answers. |
| **Google Search Grounding** | For general knowledge questions outside the document's scope, Gemini seamlessly retrieves accurate and up-to-date context from Google Search. |
| **Streaming Responses** | All AI answers stream token-by-token using the browser's native `fetch` + `ReadableStream` API, with a cancel button to interrupt any generation. |
| **Rate Limiting & Security** | Built-in robust rate limiting and security layers protect your backend API against spam and abuse. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Canvas | @xyflow/react (React Flow v12) |
| Styling | Tailwind CSS + @tailwindcss/typography |
| State Management | Zustand |
| Local Storage | Native IndexedDB |
| Markdown Rendering | react-markdown + remark-gfm + rehype-raw + rehype-sanitize |
| HTTP (streaming) | Native Fetch API + ReadableStream + AbortController |
| HTTP (upload/quiz) | Axios |
| PDF Viewer | @react-pdf/renderer |
| Backend | Python + FastAPI |
| PDF Extraction | PyMuPDF / pymupdf4llm |
| AI Model | Google Gemini 2.5 Flash via `google-generativeai` |

---

## Project Structure

```
StudyCanvas/
├── backend/                    # FastAPI Python backend
│   ├── main.py                 # App entry point, CORS, router registration
│   ├── requirements.txt        # Python dependencies
│   ├── models/
│   │   └── schemas.py          # Pydantic request/response models
│   ├── routes/
│   │   ├── upload.py           # POST /api/upload — PDF ingestion
│   │   ├── query.py            # POST /api/query — streaming AI answers
│   │   │                       # POST /api/generate-title
│   │   ├── quiz.py             # POST /api/quiz & /api/validate
│   │   ├── flashcards.py       # POST /api/flashcards
│   │   └── page_quiz.py        # POST /api/page-quiz & /api/grade-answer
│   └── services/
│       ├── gemini_service.py   # All Gemini API interactions
│       ├── pdf_service.py      # PDF text extraction + ligature correction
│       └── file_service.py     # Temp file management
└── frontend/                   # React + Vite frontend
    ├── index.html
    ├── package.json
    └── src/
        ├── App.tsx             # Root component, canvas orchestration
        ├── api/
        │   └── studyApi.ts     # Axios + fetch API wrappers
        ├── components/         # Canvas, nodes, modals, upload panel
        │   ├── Canvas.tsx
        │   ├── ContentNode.tsx
        │   ├── AnswerNode.tsx
        │   ├── FlashcardNode.tsx
        │   ├── QuizQuestionNode.tsx
        │   ├── AskGeminiPopup.tsx
        │   ├── QuestionModal.tsx
        │   ├── RevisionModal.tsx
        │   ├── ToolsModal.tsx
        │   ├── UploadPanel.tsx
        │   └── StudyNotePDF.tsx
        ├── hooks/
        │   └── useTextSelection.ts
        ├── store/
        │   └── canvasStore.ts  # Zustand global state
        ├── types/
        │   └── index.ts
        └── utils/
            ├── buildQATree.ts
            └── positioning.ts
```

---

## Prerequisites

- **Node.js** v18+ and **npm** v9+
- **Python** 3.11+
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

# Install dependencies from the root directory
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

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `GEMINI_API_KEY` | `backend/.env` | Your Google Gemini API key (required) |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a PDF; returns Markdown, raw text, and page count |
| `POST` | `/api/query` | Ask a question about highlighted text; streams AI response |
| `POST` | `/api/generate-title` | Generate a concise document title from content |
| `POST` | `/api/quiz` | Generate personalised quiz questions from struggling nodes |
| `POST` | `/api/validate` | Validate a quiz answer (short-answer via Gemini, MCQ by index) |
| `POST` | `/api/flashcards` | Generate flashcards from struggling nodes |
| `POST` | `/api/page-quiz` | Generate comprehension questions for a single page |
| `POST` | `/api/grade-answer` | Grade a page-quiz answer with personalised feedback |
| `GET` | `/api/health` | Health check |

---

## License

[MIT](LICENSE)