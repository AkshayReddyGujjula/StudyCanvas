# Add a New Backend API Route

Use this skill when the user asks you to add a new endpoint to the FastAPI backend.

Every new route requires changes in **4 locations**. Follow this order — it prevents import errors.

---

## Step 0: Plan Before Writing

Before writing any code, decide:
- **Endpoint path**: e.g. `/api/explain-diagram`
- **HTTP method**: Almost always `POST` for AI endpoints (pass data in body, not URL)
- **What it receives**: Define the request body fields
- **What it returns**: JSON response or streaming text?
- **Rate limit**: How many calls per minute/hour/day is reasonable?
- **Does it call Gemini?**: If yes, which model tier? Add the function to `gemini_service.py` first (see `/add-gemini-feature`)

---

## Step 1: Define Pydantic Models

**File**: `backend/models/schemas.py`

Add request and response models at the end of the file. Every field that accepts user text should have `max_length` to prevent token abuse.

```python
class ExplainDiagramRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded JPEG of the diagram")
    context: str = Field("", max_length=2000, description="Surrounding text context")
    question: str = Field("", max_length=500, description="What to explain about the diagram")
    user_details: str | None = Field(None, max_length=200)


class ExplainDiagramResponse(BaseModel):
    explanation: str
    model_used: str
```

**Rules**:
- For streaming endpoints, you don't need a response model — the response is plain text
- Use `str | None = Field(None, ...)` for optional fields
- Always add `max_length` to any string field that feeds into an LLM prompt
- Import `Field` from pydantic: `from pydantic import BaseModel, Field`

---

## Step 2: Create the Route File

**File**: `backend/routes/explain_diagram.py` (snake_case filename)

```python
import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from rate_limiter import limiter
from models.schemas import ExplainDiagramRequest, ExplainDiagramResponse
from services import gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/explain-diagram")
@limiter.limit("10/minute; 60/hour; 200/day")
async def explain_diagram(request: Request, payload: ExplainDiagramRequest):
    """Explains a diagram image using Gemini Vision."""
    explanation = await gemini_service.explain_diagram(
        image_base64=payload.image_base64,
        context=payload.context,
        question=payload.question,
    )
    return ExplainDiagramResponse(explanation=explanation, model_used="gemini-2.5-flash-lite")
```

**Rules**:
- Always import `Request` from fastapi and pass it as the first param to `@limiter.limit` endpoints
- `@limiter.limit(...)` must come AFTER `@router.post(...)` (decorators apply bottom-up)
- Use `logger = logging.getLogger(__name__)` — never `print()`
- Use `asyncio.to_thread(fn)` for any CPU-bound work (PDF parsing, image processing)
- For streaming responses, see `/streaming-feature` instead

### Rate Limit Guidelines

| Endpoint Type | Suggested Limit |
|---|---|
| Heavy AI (quiz, analysis) | `10/minute; 60/hour; 200/day` |
| Standard AI (Q&A, explain) | `15/minute; 100/hour; 500/day` |
| Lightweight (title, OCR) | `20/minute; 200/hour` |
| Upload | `5/minute; 30/hour` |

---

## Step 3: Register the Router

**File**: `backend/main.py`

Add the import and include_router call:

```python
# With existing imports at top
from routes import upload, query, quiz, page_quiz, flashcards, ocr, transcription, explain_diagram

# With existing include_router calls
app.include_router(explain_diagram.router, prefix="/api")
```

**Important**: Order matters if you have overlapping paths — more specific paths should come before generic ones.

---

## Step 4: Add the Frontend API Call

**File**: `frontend/src/api/studyApi.ts`

For a JSON endpoint (not streaming):
```typescript
export async function explainDiagram(
    imageBase64: string,
    context: string,
    question: string,
): Promise<{ explanation: string; model_used: string }> {
    const response = await axios.post<{ explanation: string; model_used: string }>(
        `${API_BASE}/api/explain-diagram`,
        { image_base64: imageBase64, context, question },
    )
    return response.data
}
```

For a streaming endpoint, see `/streaming-feature`.

**Rules**:
- Use Axios for JSON endpoints (it handles error statuses automatically)
- Use native `fetch` for streaming endpoints (Axios buffers)
- The `API_BASE` constant is already defined in `studyApi.ts` — use it
- Type the response explicitly with a generic `axios.post<ResponseType>(...)`

---

## Step 5: Verify

```bash
# Start backend
cd backend && uvicorn main:app --port 8000 --reload

# Check the new endpoint appears in docs
# Open http://localhost:8000/docs

# TypeScript check
cd frontend && npm run build
```

---

## Complete Checklist

- [ ] Request/Response Pydantic models in `backend/models/schemas.py`
- [ ] Route file created at `backend/routes/yourfeature.py`
  - [ ] `router = APIRouter()` defined
  - [ ] `@limiter.limit(...)` applied
  - [ ] `Request` param included in handler signature
  - [ ] `logger = logging.getLogger(__name__)` at top
- [ ] Router registered in `backend/main.py` (both import and `include_router`)
- [ ] Frontend API function added to `frontend/src/api/studyApi.ts`
- [ ] Backend starts without errors
- [ ] Frontend `npm run build` passes
