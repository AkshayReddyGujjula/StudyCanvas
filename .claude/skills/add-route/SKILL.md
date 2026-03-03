---
name: add-route
description: Scaffold a new FastAPI backend route for StudyCanvas. Use when the user wants to add a new API endpoint (e.g., a new AI feature, a new data processing endpoint, etc.).
context: fork
---

The user wants to add a new FastAPI route to the StudyCanvas backend.

## Steps

1. **Identify the route purpose, method, and path** from the user's request.

2. **Read an existing route for reference** — read `backend/routes/query.py` (streaming) or `backend/routes/flashcards.py` (non-streaming) to understand the pattern.

3. **Read schemas** — read `backend/models/schemas.py` to see existing Pydantic models.

4. **Read gemini_service.py** — read `backend/services/gemini_service.py` if the route will call Gemini.

5. **Read main.py** — read `backend/main.py` to see how routers are registered.

6. **Add Pydantic models** to `backend/models/schemas.py`:
   - Request model: `class <Feature>Request(BaseModel):`
   - Response model (if not streaming): `class <Feature>Response(BaseModel):`

7. **Add Gemini logic** to `backend/services/gemini_service.py` if needed:
   - Use `gemini_flash` for complex/analytical tasks
   - Use `gemini_flash_lite` for simple/fast tasks
   - Follow the existing async generator pattern for streaming, or return string for non-streaming

8. **Create the route file** at `backend/routes/<feature>.py`:
   ```python
   from fastapi import APIRouter
   from ..rate_limiter import limiter
   from fastapi import Request
   from ..models.schemas import <Feature>Request

   router = APIRouter()

   @router.post("/api/<endpoint>")
   @limiter.limit("10/minute")
   async def <feature>(request: Request, body: <Feature>Request):
       ...
   ```
   - For streaming: return `StreamingResponse(generator(), media_type="text/plain")`
   - For non-streaming: return the response model instance
   - Always include `@limiter.limit(...)` on Gemini-calling routes

9. **Register the router** in `backend/main.py`:
   - Import: `from .routes.<feature> import router as <feature>_router`
   - Register: `app.include_router(<feature>_router)`

10. **Add the frontend API wrapper** in `frontend/src/api/studyApi.ts`:
    - For streaming: use `fetch` with `ReadableStream` + `AbortController`
    - For non-streaming: use `axios.post<ResponseType>(...)`
    - Match the request body shape to the Pydantic model

## Key constraints
- All Gemini-calling routes MUST have `@limiter.limit(...)` from `rate_limiter.py`
- Streaming routes: `media_type="text/plain"` on `StreamingResponse`
- The `request: Request` parameter is required for `slowapi` rate limiting to work
- Do NOT add logic to `api/index.py` — it only re-exports the FastAPI app for Vercel
- Keep Gemini logic in `gemini_service.py`, not inline in route handlers
