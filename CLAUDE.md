# CLAUDE.md — StudyCanvas AI Agent Guide

This file tells AI agents exactly what matters when working in this codebase. Read it before touching anything. It focuses on what trips agents up — the README has full project context.

---

## What This App Does

StudyCanvas is an AI-powered study tool: users upload PDFs, which render as root nodes on an infinite React Flow canvas. Highlighting text and asking a question spawns a connected answer node. Follow-up questions branch further, building a visual knowledge tree.

**Stack**: React 19 + TypeScript (Vite 7) frontend · FastAPI backend · Both deploy to Vercel as a single project.

---

## The Rules That Cannot Be Broken

### 1. Always use `updateNodeData()` to update node data
```typescript
// CORRECT — use this always
const updateNodeData = useCanvasStore(s => s.updateNodeData)
updateNodeData(nodeId, { isLoading: false, answer: text })

// WRONG — causes stale-closure/reconciliation bugs in ReactFlow
setNodes(nodes => nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, answer: text } } : n))
```

### 2. All type-only imports must use `import type`
`verbatimModuleSyntax` is enabled in `tsconfig.app.json` — the compiler rejects bare imports for types.
```typescript
import type { AnswerNodeData, NodeStatus } from '@/types'  // CORRECT
import { AnswerNodeData } from '@/types'                    // BUILD FAILS
```

### 3. All shared TypeScript interfaces live in `frontend/src/types/index.ts` only
Never define node data types in component files.

### 4. All Gemini API calls live in `backend/services/gemini_service.py` only
Never call Gemini from a route file. Routes call gemini_service functions.

### 5. Use `fetch` + `ReadableStream` for streaming, never Axios
Axios buffers the full response. Streaming endpoints (`/api/query`, `/api/summarize-page`) must use native fetch.

### 6. Use `google-genai` SDK, not `google-generativeai`
```python
from google import genai          # CORRECT
from google.genai import types    # CORRECT
# import google.generativeai      # WRONG — not installed
```

### 7. `pymupdf4llm` is excluded from Vercel — do not add it to requirements.txt
It exceeds Vercel's 250 MB Lambda limit. `pdf_service.py` auto-detects it for local dev only.

### 8. Never use `print()` in Python — use the logger
```python
logger = logging.getLogger(__name__)
logger.info("message")   # CORRECT
print("message")          # WRONG
```

---

## Directory Layout (Critical Files Only)

```
StudyCanvas/
├── backend/
│   ├── main.py                    # Register new routers here
│   ├── rate_limiter.py            # Import `limiter` from here
│   ├── models/schemas.py          # ALL Pydantic models go here
│   ├── routes/                    # One file per feature, all use APIRouter()
│   └── services/
│       └── gemini_service.py      # ALL Gemini calls go here
├── frontend/src/
│   ├── types/index.ts             # ALL TypeScript interfaces go here
│   ├── api/studyApi.ts            # ALL HTTP calls go here (Axios + fetch)
│   ├── store/
│   │   ├── canvasStore.ts         # Per-canvas state (nodes, edges, PDF, drawing)
│   │   └── appStore.ts            # Global state (canvas list, folders, user)
│   ├── components/
│   │   └── Canvas.tsx             # NODE_TYPES registry lives here (line ~90)
│   └── utils/positioning.ts       # Node placement algorithm — import from here
└── .claude/commands/              # AI skill files (add-node-type, etc.)
```

---

## How to Add a New Node Type (Checklist)

There are exactly 3 locations to update. If you miss any, it silently fails.

1. **`frontend/src/types/index.ts`** — Add the data interface
2. **`frontend/src/components/YourNode.tsx`** — Create the component (`memo` wrapped, typed with `NodeProps`)
3. **`frontend/src/components/Canvas.tsx`** — Register in `NODE_TYPES` object (~line 90) and add a color case to `computeNodeColor()`

See `.claude/commands/add-node-type.md` for the full step-by-step.

---

## How to Add a New Backend Route (Checklist)

4 locations to update:

1. **`backend/models/schemas.py`** — Add request/response Pydantic models
2. **`backend/routes/yourfeature.py`** — Create route file with `router = APIRouter()`
3. **`backend/main.py`** — Register: `app.include_router(yourfeature.router, prefix="/api")`
4. **`frontend/src/api/studyApi.ts`** — Add the frontend API call

See `.claude/commands/add-api-route.md` for the full step-by-step.

---

## State Management Rules

| Store | File | Purpose |
|---|---|---|
| `useCanvasStore` | `store/canvasStore.ts` | Current canvas: nodes, edges, PDF data, drawing strokes |
| `useAppStore` | `store/appStore.ts` | Global: canvas list, folders, directory handle, user context |

- **Never use local `useState` for cross-component state** — use the Zustand stores.
- After mutating nodes/edges, call `persistToLocalStorage()` to save.
- `updateNodeData(nodeId, partialData)` merges into the node's existing data — you only need to pass changed fields.

---

## Gemini Model Tiers

| Constant | Model ID | Use For |
|---|---|---|
| `MODEL_LITE` | `gemini-2.5-flash-lite` | OCR, title generation, simple Q&A |
| `MODEL_FLASH` | `gemini-2.5-flash` | Quiz generation, grading, complex analysis |

`classify_query_complexity()` auto-routes between them — use it for `/api/query` style endpoints.

---

## Frontend Color Palette

| Token | Hex | Used For |
|---|---|---|
| `primary` | `#1E3A5F` | Content nodes, deep navy |
| `secondary` | `#2D9CDB` | Answer/quiz/flashcard nodes, teal |
| `accent` | `#EB5757` | Struggling status, errors, coral |
| `success` | `#27AE60` | Understood status, green |
| `neutral` | `#6B7280` | Loading state, icons, slate |

Use as Tailwind classes: `bg-primary-50`, `text-secondary-600`, `border-accent-500`.

---

## The 4 MB PDF Boundary

Vercel's request body limit is ~4.5 MB.

- **≤ 4 MB**: Binary PDF → `/api/upload` → server extracts with pypdf
- **> 4 MB**: Client extracts text with pdf.js → JSON → `/api/upload-text`

Both return the same `UploadResponse`. This logic is already in `studyApi.ts` — don't duplicate it.

---

## Streaming Response Pattern

**Backend** (`backend/routes/yourroute.py`):
```python
async def _generator():
    async for chunk in gemini_service.your_stream_fn(...):
        yield chunk

return StreamingResponse(_generator(), media_type="text/plain", headers={"X-Model-Used": model_name})
```

**Frontend** (`frontend/src/api/studyApi.ts`):
```typescript
const controller = new AbortController()
const response = await fetch(`${API_BASE}/api/endpoint`, { method: 'POST', body: ..., signal: controller.signal })
const reader = response.body!.getReader()
const decoder = new TextDecoder()
while (true) {
    const { done, value } = await reader.read()
    if (done) break
    updateNodeData(nodeId, { answer: accumulated += decoder.decode(value) })
}
```

Store the `AbortController` in `canvasStore.activeAbortController` so it can be cancelled on unmount.

---

## Performance Rules for Canvas.tsx

- Wrap callbacks passed to ReactFlow nodes with `useCallback`.
- Wrap expensive computations with `useMemo`.
- Node components should be wrapped with `React.memo`.
- Canvas.tsx is ~3000 lines — don't add state that belongs in a store.

---

## Running the Project

```bash
# Backend (port 8000)
cd backend && uvicorn main:app --port 8000 --reload

# Frontend (port 5173)
cd frontend && npm run dev

# TypeScript check + build
cd frontend && npm run build

# Lint
cd frontend && npm run lint
```

There is no test framework configured. `npm run build` is the validation step.

---

## Available AI Skills

Use these Claude Code custom commands for common tasks:

| Command | Purpose |
|---|---|
| `/add-node-type` | Add a new React Flow node type (full checklist) |
| `/add-api-route` | Add a new FastAPI backend route (full checklist) |
| `/add-gemini-feature` | Extend Gemini capabilities in gemini_service.py |
| `/streaming-feature` | Implement a streaming endpoint + frontend consumer |
| `/auto-skill-writer` | Analyze session patterns and write new skills |
