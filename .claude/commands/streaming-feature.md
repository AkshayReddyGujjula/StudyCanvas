# Implement a Streaming Feature (End-to-End)

Use this skill when the user asks you to add a feature where AI output streams incrementally to the canvas (typing effect), rather than waiting for the full response.

StudyCanvas already has two streaming endpoints: `/api/query` (Q&A answers) and page summary. Use those as the canonical reference.

---

## When to Stream vs Not Stream

**Use streaming when**:
- The AI response is long (answers, summaries, explanations)
- You want the typing/live effect for UX
- The user might want to cancel mid-response

**Do NOT stream when**:
- The response is short (titles, grades, classifications)
- The response must be parsed as JSON (quiz questions, flashcards)
- The response is a simple pass/fail (validation)

---

## Backend: Async Generator + StreamingResponse

**File**: `backend/services/gemini_service.py`

```python
async def stream_my_feature(
    content: str,
    question: str,
    model_name: str = MODEL_FLASH,
    image_base64: str | None = None,
):
    """
    Async generator that yields plain-text chunks from Gemini.
    Designed to be wrapped in a FastAPI StreamingResponse.
    """
    contents: list = []

    # Add image context if provided (captures diagrams and handwriting)
    if image_base64:
        try:
            import base64
            image_data = base64.b64decode(image_base64)
            from google.genai import types
            contents.append(types.Part.from_bytes(data=image_data, mime_type="image/jpeg"))
        except Exception:
            logger.warning("Could not decode image for streaming feature")

    prompt = (
        "Your system prompt here.\n\n"
        f"Content: {content[:4000]}\n\n"
        f"Question: {question}"
    )
    contents.append(prompt)

    async for chunk in await _client.aio.models.generate_content_stream(
        model=model_name,
        contents=contents,
        config=types.GenerateContentConfig(
            max_output_tokens=2000,
            temperature=0.6,
        ),
    ):
        if chunk.text:
            yield chunk.text
```

**File**: `backend/routes/myfeature.py`

```python
import logging
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from rate_limiter import limiter
from models.schemas import MyFeatureRequest
from services import gemini_service
from services.gemini_service import MODEL_FLASH

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/my-feature")
@limiter.limit("10/minute; 60/hour")
async def my_feature_stream(request: Request, payload: MyFeatureRequest):
    model_name = MODEL_FLASH  # or classify_query_complexity() if variable
    generator = gemini_service.stream_my_feature(
        content=payload.content,
        question=payload.question,
        model_name=model_name,
        image_base64=payload.image_base64,
    )
    return StreamingResponse(
        generator,
        media_type="text/plain",
        headers={"X-Model-Used": model_name},
    )
```

**Key rules**:
- `StreamingResponse` wraps the async generator — do NOT `await` the generator
- `media_type="text/plain"` — streaming responses are plain text, never JSON
- Always expose `X-Model-Used` header (already allowed in CORS config in `main.py`)
- The generator function uses `yield`, not `return`

---

## Frontend: fetch + ReadableStream + AbortController

**File**: `frontend/src/api/studyApi.ts`

```typescript
export async function streamMyFeature(
    content: string,
    question: string,
    imageBase64?: string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
): Promise<string> {
    const response = await fetch(`${API_BASE}/api/my-feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            content,
            question,
            image_base64: imageBase64,
        }),
        signal,  // AbortController signal for cancellation
    })

    if (!response.ok) {
        throw new Error(`Stream request failed: ${response.status}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let accumulated = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            accumulated += chunk
            onChunk(accumulated)  // pass the FULL accumulated text (not just the chunk)
        }
    } finally {
        reader.releaseLock()
    }

    return accumulated
}
```

**Rules**:
- `fetch` only — never Axios for streaming (Axios buffers the full response)
- Pass the **accumulated** text to `onChunk`, not just the latest chunk — this makes the node update correctly
- Always call `reader.releaseLock()` in `finally` to prevent memory leaks
- Pass `signal` from an `AbortController` so the user can cancel

---

## Canvas Integration: Calling the Stream from a Component

**In the component or in Canvas.tsx**:

```typescript
const handleStreamFeature = useCallback(async () => {
    // 1. Create abort controller and store it so it can be cancelled on unmount
    const controller = new AbortController()
    setActiveAbortController(controller)

    // 2. Set the node to loading state
    updateNodeData(nodeId, { isLoading: true, isStreaming: true, answer: '' })

    try {
        await streamMyFeature(
            content,
            question,
            imageBase64,
            (accumulated) => {
                // 3. Update node with each chunk — use updateNodeData, never setNodes directly
                updateNodeData(nodeId, { answer: accumulated, isLoading: false })
            },
            controller.signal,
        )
    } catch (err) {
        if ((err as Error).name === 'AbortError') {
            // User cancelled — not an error
            return
        }
        updateNodeData(nodeId, { answer: 'Error: could not load response.', isLoading: false })
    } finally {
        // 4. Clear the abort controller and streaming state
        setActiveAbortController(null)
        updateNodeData(nodeId, { isStreaming: false })
        persistToLocalStorage()
    }
}, [nodeId, content, question, imageBase64, updateNodeData, setActiveAbortController, persistToLocalStorage])

// 5. Cancel on component unmount
useEffect(() => {
    return () => {
        activeAbortController?.abort()
    }
}, [activeAbortController])
```

**Rules**:
- Always use `updateNodeData(nodeId, partial)` — never `setNodes()` inside streaming callbacks
- Store the `AbortController` in `canvasStore.activeAbortController` — this enables the "Stop" button in the UI
- Call `persistToLocalStorage()` after streaming completes (not during — too expensive)
- Handle `AbortError` separately — it's not a real error, just user cancellation

---

## Reading the X-Model-Used Header (Optional)

If you want to show which model was used (like AnswerNode does):

```typescript
const modelUsed = response.headers.get('X-Model-Used') ?? ''
updateNodeData(nodeId, { modelUsed })
```

Then in the node component, render it with the `ModelIndicator` component:
```typescript
import ModelIndicator from './ModelIndicator'
// In JSX:
<ModelIndicator model={data.modelUsed} />
```

---

## Complete Checklist

**Backend**:
- [ ] Async generator function in `gemini_service.py` using `yield`
- [ ] Route returns `StreamingResponse(generator, media_type="text/plain")`
- [ ] `X-Model-Used` header included in response
- [ ] Rate limit applied with `@limiter.limit(...)`
- [ ] Router registered in `main.py`

**Frontend**:
- [ ] Uses `fetch` (not Axios)
- [ ] `AbortController` created and stored in `canvasStore.activeAbortController`
- [ ] `onChunk` receives accumulated text (not just the latest chunk)
- [ ] `reader.releaseLock()` called in `finally`
- [ ] `AbortError` handled silently (user cancellation)
- [ ] `updateNodeData` used for all node updates during streaming (not `setNodes`)
- [ ] `persistToLocalStorage()` called once after stream completes
- [ ] `useEffect` cleanup cancels in-flight request on unmount
