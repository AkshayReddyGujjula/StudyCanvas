# Add a New Gemini AI Feature

Use this skill when the user asks you to add a new AI capability that calls the Gemini API.

**Critical rule**: All Gemini API calls must live in `backend/services/gemini_service.py`. Route files call service functions — they never instantiate the client or call the API directly.

---

## Step 0: Understand the Existing Structure

Before writing anything, read these sections of `backend/services/gemini_service.py`:

1. The two model constants at the top (`MODEL_LITE`, `MODEL_FLASH`)
2. One existing function similar to yours (e.g. `generate_quiz` for structured output, `stream_query` for streaming)
3. `_needs_pdf_context()` — understand when to include raw PDF text

The client is already initialized at module level:
```python
_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))
```
Never re-initialize it. Never hardcode an API key.

---

## Step 1: Choose the Right Model and Call Type

### Model Selection
| Use Case | Model | Constant |
|---|---|---|
| OCR, title generation, simple factual Q&A | `gemini-2.5-flash-lite` | `MODEL_LITE` |
| Quiz generation, answer grading, complex analysis | `gemini-2.5-flash` | `MODEL_FLASH` |
| User-directed queries | Auto-detected | `classify_query_complexity()` |

### Call Type
| Response Type | Function | Use When |
|---|---|---|
| Plain text (single call) | `generate_content` (async) | Short responses, structured data |
| Streaming text | `generate_content_stream` (async) | Long answers, real-time UX |
| Structured JSON | `generate_content` + JSON parsing | Quiz questions, flashcards |

---

## Step 2: Write the Service Function

**File**: `backend/services/gemini_service.py`

### Pattern A: Simple Text Response (non-streaming)
```python
async def explain_concept(
    concept: str,
    context: str,
    user_details: str | None = None,
) -> str:
    """
    Returns a brief plain-text explanation of a concept.
    Suitable for tooltip-style quick explanations.
    """
    user_section = f"\n\nStudent context: {user_details}" if user_details else ""
    prompt = (
        "You are a helpful academic tutor. Explain the following concept clearly "
        "and concisely in 2-3 sentences suitable for a student.\n\n"
        f"Concept: {concept}\n\n"
        f"Context from their notes: {context[:2000]}"
        f"{user_section}"
    )
    response = await _client.aio.models.generate_content(
        model=MODEL_LITE,
        contents=prompt,
        config=types.GenerateContentConfig(
            max_output_tokens=300,
            temperature=0.4,
        ),
    )
    # Always use this safe extraction pattern — response.text can be None
    raw = response.text
    if not raw:
        try:
            raw = response.candidates[0].content.parts[0].text or ""
        except (IndexError, AttributeError):
            raw = ""
    return raw.strip()
```

### Pattern B: Streaming Text Response
```python
async def stream_explanation(
    question: str,
    context: str,
    model_name: str = MODEL_FLASH,
):
    """
    Async generator that yields text chunks for streaming to the frontend.
    """
    prompt = (
        "You are a helpful academic tutor.\n\n"
        f"Context: {context[:3000]}\n\n"
        f"Question: {question}"
    )
    async for chunk in await _client.aio.models.generate_content_stream(
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            max_output_tokens=1500,
            temperature=0.5,
        ),
    ):
        if chunk.text:
            yield chunk.text
```

### Pattern C: Structured JSON Output (Quiz/Flashcards style)
```python
async def generate_key_terms(
    raw_text: str,
    image_base64: str | None = None,
    count: int = 10,
) -> list[dict]:
    """
    Returns a list of {term, definition} dicts from the provided content.
    Always include image_base64 when available — it captures diagrams and annotations.
    """
    contents: list = []

    # Include page image if provided (it is the PRIMARY source for handwritten content)
    if image_base64:
        try:
            image_data = base64.b64decode(image_base64)
            contents.append(types.Part.from_bytes(data=image_data, mime_type="image/jpeg"))
        except Exception:
            logger.warning("Failed to decode image_base64 for key terms generation")

    prompt = (
        f"Extract exactly {count} key terms from the provided content.\n\n"
        "Return a JSON array of objects, each with:\n"
        '- "term": the technical term or concept\n'
        '- "definition": a clear 1-2 sentence definition\n\n'
        "Return ONLY valid JSON. No markdown, no explanation.\n\n"
        f"Text content:\n{raw_text[:4000]}"
    )
    contents.append(prompt)

    response = await _client.aio.models.generate_content(
        model=MODEL_FLASH,
        contents=contents,
        config=types.GenerateContentConfig(
            max_output_tokens=2000,
            temperature=0.3,
            response_mime_type="application/json",  # forces valid JSON output
        ),
    )

    raw = response.text or ""
    try:
        # Strip markdown fences if present
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(clean)
    except json.JSONDecodeError:
        logger.error("Failed to parse key terms JSON: %s", raw[:200])
        raise HTTPException(status_code=500, detail="AI returned invalid JSON")
```

---

## Step 3: Multimodal Requests (with Page Images)

When your feature relates to PDF content, **always accept and use `image_base64`**. The image captures:
- Handwritten annotations students added
- Diagrams and charts that text extraction misses
- Mathematical notation

```python
# Build contents list — image FIRST, then text prompt
contents: list = []
if image_base64:
    image_data = base64.b64decode(image_base64)
    contents.append(types.Part.from_bytes(data=image_data, mime_type="image/jpeg"))
contents.append(your_text_prompt)
```

---

## Step 4: Prompt Engineering Guidelines for This App

- **Be specific about format**: Tell the model exactly what to return ("Return ONLY valid JSON", "Respond in plain text with no markdown")
- **Set output token limits**: Prevents runaway responses. Use `max_output_tokens` in `GenerateContentConfig`
- **Temperature**:
  - `0.2–0.4` for factual/structured output (quiz, flashcards)
  - `0.5–0.7` for explanations and Q&A
  - `0.8–1.0` almost never used in this app
- **System context**: Include user details (name, level) when `user_details` is provided — personalization improves quality
- **Truncate inputs**: Slice text with `[:N]` to avoid token limits. `raw_text[:4000]`, `context[:2000]`

---

## Step 5: Error Handling

```python
# Safe text extraction (response.text can be None on blocked/empty responses)
raw = response.text
if not raw:
    try:
        raw = response.candidates[0].content.parts[0].text or ""
    except (IndexError, AttributeError):
        raw = ""

# Re-raise HTTP exceptions with meaningful messages
if not raw.strip():
    raise HTTPException(status_code=500, detail="AI returned an empty response")
```

---

## Step 6: Connect to a Route

After writing the service function, follow `/add-api-route` to create the route that calls it.

---

## Checklist

- [ ] Function added to `backend/services/gemini_service.py` only
- [ ] Client not re-initialized (use `_client` already at module level)
- [ ] No hardcoded API keys
- [ ] `MODEL_LITE` or `MODEL_FLASH` constants used (not raw strings)
- [ ] Safe text extraction pattern used (handles `response.text is None`)
- [ ] `image_base64` parameter accepted if feature relates to PDF content
- [ ] Inputs truncated with `[:N]` slicing
- [ ] `max_output_tokens` set in `GenerateContentConfig`
- [ ] `logger.error()` used for error logging (not `print()`)
- [ ] Route file created to expose the function (see `/add-api-route`)
