# StudyCanvas

> **Every other AI gives you a conversation. We give you a map of your understanding.**

StudyCanvas is an AI-powered, spatial study tool that transforms your lecture notes and PDF documents into an interactive, visual knowledge graph. Instead of drowning in a linear chat window, you build a tree of understanding directly anchored to your source material — on an infinite canvas.

---

## What It Does

1. **Upload a PDF** — your lecture slides, textbook chapters, or revision notes.
2. **Read on the canvas** — the document is converted to clean Markdown and rendered as the central content node on an infinite, pan-and-zoomable canvas.
3. **Highlight & Ask** — highlight any passage of text, click the floating **✨ Ask Gemini** popup, type your question, and receive an AI-generated answer as a connected node beside the content.
4. **Branch your understanding** — highlight text inside any answer to ask follow-up questions. Every answer spawns further connected nodes, building a visual knowledge tree that grows as deep as your curiosity.
5. **Test yourself** — use the built-in quiz and flashcard modes to generate practice questions from the nodes you're struggling with most, powered by Gemini.
6. **Page-by-page comprehension checks** — generate short-answer questions on a per-page basis and receive instant, personalised feedback on your answers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Canvas | @xyflow/react (React Flow v12) |
| Styling | Tailwind CSS + @tailwindcss/typography |
| State | Zustand |
| Markdown | react-markdown + remark-gfm + rehype-raw + rehype-sanitize |
| HTTP | Axios (upload/quiz) + Fetch API with ReadableStream (streaming) |
| Backend | Python + FastAPI |
| PDF Extraction | PyMuPDF / pymupdf4llm |
| AI Model | Google Gemini 2.5 Flash via `google-generativeai` |

---

## Project Structure

```
StudyCanvas/
├── backend/                  # FastAPI Python backend
│   ├── main.py               # App entry point, CORS, router registration
│   ├── requirements.txt      # Python dependencies
│   ├── models/
│   │   └── schemas.py        # Pydantic request/response models
│   ├── routes/
│   │   ├── upload.py         # POST /api/upload — PDF ingestion
│   │   ├── query.py          # POST /api/query — streaming AI answers
│   │   ├── quiz.py           # POST /api/quiz & /api/validate
│   │   ├── flashcards.py     # POST /api/flashcards
│   │   └── page_quiz.py      # POST /api/page-quiz & /api/grade-answer
│   └── services/
│       ├── gemini_service.py # All Gemini API interactions
│       ├── pdf_service.py    # PDF text + Markdown extraction
│       └── file_service.py   # Temp file management
└── frontend/                 # React + Vite frontend
    ├── index.html
    ├── package.json
    └── src/
        ├── App.tsx
        ├── api/studyApi.ts   # Axios + fetch API wrappers
        ├── components/       # Canvas, nodes, modals, upload panel
        ├── store/
        │   └── canvasStore.ts # Zustand global state
        ├── types/index.ts
        └── utils/            # Canvas layout helpers
```

---

## Prerequisites

- **Node.js** v18+ and **npm** v9+
- **Python** 3.11+
- A **Google Gemini API key** — get one at [aistudio.google.com](https://aistudio.google.com)

---

## Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/AkshayReddyGujjula/StudyCanvas.git
cd StudyCanvas
```

### 2. Backend setup

```bash
cd backend

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
uvicorn main:app --port 8000 --reload
```

The API will be available at `http://localhost:8000`. You can view the auto-generated docs at `http://localhost:8000/docs`.

### 3. Frontend setup

Open a new terminal:

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
| `POST` | `/api/upload` | Upload a PDF; returns Markdown + raw text |
| `POST` | `/api/query` | Ask a question; streams AI response as plain text |
| `POST` | `/api/generate-title` | Generate a document title from content |
| `POST` | `/api/quiz` | Generate quiz questions from struggling nodes |
| `POST` | `/api/validate` | Validate a quiz answer |
| `POST` | `/api/flashcards` | Generate flashcards from struggling nodes |
| `POST` | `/api/page-quiz` | Generate comprehension questions for a page |
| `POST` | `/api/grade-answer` | Grade a page-quiz answer with feedback |
| `GET` | `/api/health` | Health check |

---

## License

[MIT](LICENSE)