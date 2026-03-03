---
name: add-gemini-feature
description: Add a complete end-to-end Gemini-powered feature to StudyCanvas — from backend service and route to frontend API call and canvas node. Use when the user wants a new AI capability that spans both frontend and backend.
context: fork
---

The user wants to add a new end-to-end AI/Gemini feature to StudyCanvas.

## Steps

### Understand the feature
1. Identify: What does the user input? What does Gemini produce? How is the result shown on canvas?
2. Decide: Is the response **streaming** (long text answer → shown token by token) or **non-streaming** (structured data → quiz, flashcards, etc.)?

### Backend

3. **Read `backend/services/gemini_service.py`** to understand how to call Gemini models and the prompt patterns used.

4. **Read `backend/models/schemas.py`** to see existing Pydantic models.

5. **Add Pydantic models** to `backend/models/schemas.py`:
   - Request body model with all inputs Gemini needs (text, page content, images if needed)
   - Response model for non-streaming endpoints

6. **Add the Gemini function** to `backend/services/gemini_service.py`:
   - Use `gemini_flash` (`gemini-2.5-flash-preview-04-17`) for complex reasoning
   - Use `gemini_flash_lite` (`gemini-2.5-flash-lite-preview-06-17`) for simple/fast tasks
   - For streaming: `async def` generator that yields text chunks
   - Write a clear, structured prompt — use the page markdown text AND page image (base64 JPEG) when the feature involves document content, so Gemini can read handwriting/diagrams
   - Include explicit JSON output instructions if the response is structured data

7. **Create the route** at `backend/routes/<feature>.py`:
   - Always include `@limiter.limit("10/minute")` and `request: Request` parameter
   - For streaming: `StreamingResponse(generator(), media_type="text/plain")`
   - For structured JSON: return the Pydantic response model

8. **Register** in `backend/main.py`

### Frontend

9. **Add API wrapper** in `frontend/src/api/studyApi.ts`:
   - Streaming: `fetch` + `ReadableStream` + `AbortController` (follow the `streamQuery` pattern)
   - Non-streaming: `axios.post<ResponseType>(...)`

10. **Create a canvas node** for displaying results (use `/add-node` pattern):
    - Show a loading/streaming state while waiting for Gemini
    - Display the result (markdown via `react-markdown`, structured data as cards, etc.)
    - Include a `ModelIndicator` component to show which Gemini model was used
    - Handle errors gracefully with a visible error state in the node

11. **Wire up the trigger** — decide how the user initiates the feature:
    - From `LeftToolbar.tsx` button (standalone feature)
    - From an existing node's action button (e.g., inside ContentNode, AnswerNode)
    - From the `AskGeminiPopup.tsx` (text-selection triggered)

### Final checks

12. Verify:
    - Rate limiter is applied to the route
    - The Gemini model choice matches task complexity
    - Large/handwritten content: page image is included in the Gemini request
    - Streaming cancel button is present if using streaming
    - Node shows meaningful loading, success, and error states
    - New types are added to `frontend/src/types/index.ts`

## Gemini model guidance
- **Flash (complex):** quiz generation, answer grading, OCR, contextual Q&A, document analysis
- **Flash Lite (simple):** title generation, short summaries, simple classification

## Prompt writing tips for StudyCanvas
- Always specify output format explicitly (JSON schema or markdown structure)
- Include both `page_text` (markdown) and `page_image` (base64 JPEG) for document-based features — Gemini can read handwritten annotations from images
- Use temperature 0 for structured/deterministic output (quizzes, flashcards)
- Ask Gemini to scale quantity to content richness (e.g., "generate 2-4 questions based on content density")
