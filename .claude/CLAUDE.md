# StudyCanvas

AI-powered spatial study tool. PDFs become root nodes on an infinite React Flow canvas. Users highlight text → Ask Gemini → answers appear as connected child nodes, building a visual knowledge map.

## Architecture

**Frontend:** React 19 + TypeScript + Vite 7 (`frontend/src/`)
**Backend:** Python 3.12 + FastAPI (`backend/`) → deployed as Vercel serverless via `api/index.py`
**AI:** Gemini 2.5 Flash (complex) + Gemini 2.5 Flash Lite (simple) via `google-generativeai`

## Dev Commands

```bash
# Backend
cd backend && uvicorn main:app --port 8000 --reload

# Frontend (separate terminal)
cd frontend && npm run dev        # http://localhost:5173
cd frontend && npm run build
cd frontend && npm run lint
```

Backend API docs at `http://localhost:8000/docs`

## Key File Locations

| What | Where |
|------|-------|
| All canvas node components | `frontend/src/components/*Node.tsx` |
| Main canvas logic + event handlers | `frontend/src/components/Canvas.tsx` |
| Node/edge type registration | `frontend/src/components/Canvas.tsx` (nodeTypes object) |
| Shared TypeScript types | `frontend/src/types/index.ts` |
| API wrappers (frontend) | `frontend/src/api/studyApi.ts` |
| Canvas & app state (Zustand) | `frontend/src/store/canvasStore.ts`, `appStore.ts` |
| Left toolbar (insert nodes) | `frontend/src/components/LeftToolbar.tsx` |
| All Gemini API calls | `backend/services/gemini_service.py` |
| Pydantic request/response models | `backend/models/schemas.py` |
| FastAPI route files | `backend/routes/*.py` |
| Route registration | `backend/main.py` |
| File System Access API | `frontend/src/services/fileSystemService.ts` |
| Node positioning helpers | `frontend/src/utils/positioning.ts` |

## Canvas Node Pattern

Every node type follows this pattern:
1. **Component file:** `frontend/src/components/<Name>Node.tsx` — accepts `NodeProps` from `@xyflow/react`
2. **Type registration:** Add to `nodeTypes` object in `Canvas.tsx`
3. **Type definition:** Add node data type to `frontend/src/types/index.ts`
4. **Toolbar entry (if user-insertable):** Add button in `LeftToolbar.tsx` that calls `addNode()` from canvasStore

Node data is stored in `data` prop. Use `useReactFlow()` to update node data from within a node.

## Backend Route Pattern

Every route follows this pattern:
1. **Schema:** Add request/response Pydantic models to `backend/models/schemas.py`
2. **Route file:** `backend/routes/<feature>.py` — use `@router.post(...)` with `@limiter.limit(...)` decorator
3. **Service call:** Heavy Gemini logic goes in `backend/services/gemini_service.py`
4. **Registration:** `include_router()` in `backend/main.py`
5. **Frontend wrapper:** Add typed fetch/axios call in `frontend/src/api/studyApi.ts`

## Streaming AI Responses

Streaming routes use FastAPI `StreamingResponse` + `media_type="text/plain"`.
Frontend consumes with `fetch` + `ReadableStream` + `AbortController` (see `studyApi.ts`).
Non-streaming routes use Axios.

## Large PDF Handling

PDFs > 4 MB: frontend extracts text client-side via pdf.js → POST to `/api/upload-text`.
PDFs ≤ 4 MB: uploaded as multipart to `/api/upload` → `pdf_service.py` extracts text server-side.
Vercel Lambda body limit: 4.5 MB.

## Gemini Model Routing

- `gemini-2.5-flash-preview-04-17` — complex/analytical (quiz, grade, OCR, query)
- `gemini-2.5-flash-lite-preview-06-17` — simple/fast (title generation, summaries)
- Users can override model per `CustomPromptNode`

## Environment Variables

- `backend/.env` → `GEMINI_API_KEY=...` (local dev)
- `ALLOWED_ORIGINS` → comma-separated CORS origins (Vercel production only)

## Rate Limiting

All heavy LLM routes use `@limiter.limit("10/minute")` from `backend/rate_limiter.py`. Add it to any new Gemini-calling route.

## Deployment

Vercel: frontend builds to static, backend runs as Python 3.12 serverless.
`api/index.py` re-exports the FastAPI `app` — do not add logic there.
`vercel.json` routes `/api/*` → serverless, everything else → SPA.

## Code Conventions

- TypeScript strict mode; always type node `data` with interfaces from `types/index.ts`
- Tailwind CSS for all styling — no inline styles except dynamic values
- Zustand stores use `set()` with partial updates; avoid replacing entire state
- React Flow node components must be memoized (wrap with `memo()` or use `useCallback` on handlers)
- All API errors surface to the user via node state (e.g., `status: 'error'`), not console-only
