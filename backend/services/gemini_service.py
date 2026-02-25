import os
import json
import base64
import logging
import asyncio
import google.generativeai as genai
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Initialise the Gemini client once at module level
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))


async def generate_title(raw_text: str) -> str:
    """
    Asks Gemini for a concise, descriptive document title (4-6 words).
    Receives the cleaned Markdown content (not raw PDF extraction) for accuracy.
    Returns plain text with no markdown, punctuation, or explanation.
    """
    model = genai.GenerativeModel("gemini-2.5-flash")
    # Use up to 6000 chars of the (already-clean) markdown content
    excerpt = raw_text[:6000]
    prompt = (
        "You are an academic document titling assistant.\n\n"
        "Your task: read the document excerpt below and produce a SINGLE, SHORT, DESCRIPTIVE TITLE "
        "that accurately captures the main subject matter.\n\n"
        "Rules (follow every one):\n"
        "- The title MUST be between 3 and 6 words.\n"
        "- The title must describe the SPECIFIC topic, subject, or concept of the document. "
        "Do NOT use generic titles like 'Study Notes', 'Document Summary', 'Course Notes', or similar.\n"
        "- Use title case (capitalise main words).\n"
        "- Output ONLY the title. No explanation, no punctuation at the end, no quotes, no markdown.\n\n"
        "Examples of GOOD titles: 'Introduction to Neural Networks', "
        "'World War Two Causes and Effects', 'Python Data Structures Guide', "
        "'Human Digestive System Overview'\n\n"
        f"Document excerpt:\n\n{excerpt}"
    )
    response = await asyncio.to_thread(
        lambda: model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(max_output_tokens=50, temperature=0.3),
        )
    )
    # Safely extract text — finish_reason 2 (MAX_TOKENS) or blocked candidates
    # can leave response.text inaccessible, so check candidates directly.
    try:
        raw = response.text
    except ValueError:
        # Fallback: try pulling text from the first candidate's parts
        try:
            raw = response.candidates[0].content.parts[0].text
        except Exception:
            return "Study Notes"
    title = raw.strip().strip('"').strip("'")
    # Hard-cap at 6 words as a safety net
    words = title.split()
    if len(words) > 6:
        title = " ".join(words[:6])
    return title



def _needs_pdf_context(question: str, highlighted_text: str) -> bool:
    """
    Fast, zero-latency heuristic to decide if the PDF raw_text is needed.

    Returns True  → the question explicitly references the document content
                    (uses words like 'this', 'listed', 'section', etc.)
    Returns False → the question is about general knowledge that can be
                    answered without reading the document (factual, historical,
                    conceptual questions).

    This avoids sending thousands of PDF tokens to Gemini when unnecessary,
    significantly reducing latency for general-knowledge questions.
    """
    q_lower = question.lower().strip()

    # Keywords that strongly indicate the student needs the document's own text
    doc_reference_patterns = [
        "this document", "the document", "this doc", "the doc", "these docs",
        "this pdf", "the pdf", "this file", "the file",
        "this article", "the article", "this paper", "the paper",
        "this reading", "the reading", "this extract", "the extract",
        "this excerpt", "the excerpt", "this material", "the material", "these materials",
        "this slide", "these slides", "the slides", "this presentation", "the presentation",
        "this lecture", "the lecture", "this notes", "these notes", "the notes",
        "in this", "from this", "this section", "this page", "this passage", "this text",
        "this paragraph", "this chapter", "this sentence", "this word", "this phrase",
        "listed here", "listed in", "mentioned here", "mentioned in", "above", "below",
        "stated here", "stated in", "explained here", "explained in",
        "discussed here", "discussed in", "covered here", "covered in",
        "according to", "as stated", "as described", "as shown", "as explained", "as discussed",
        "what does it say", "what does this say", "what does the",
        "give an example from", "example from this", "example in this",
        "steps listed", "steps in", "steps here",
    ]
    if any(pat in q_lower for pat in doc_reference_patterns):
        return True

    # Short questions with demonstrative pronouns almost always refer to the doc
    demonstrative_starters = ("what is this", "what does this", "explain this",
                              "describe this", "summarise this", "summarize this",
                              "what are these", "what does it", "how does this",
                              "why does this", "what about this")
    if any(q_lower.startswith(s) for s in demonstrative_starters):
        return True

    # Everything else: general knowledge, historical facts, conceptual questions
    return False


async def stream_query(
    question: str,
    highlighted_text: str,
    raw_text: str,
    parent_response: str | None,
    user_details=None,
    chat_history: list = None,
):
    """
    Asynchronous generator that streams the Gemini response for a student query.
    First runs a fast classifier to decide if the PDF context is needed,
    then streams with or without raw_text accordingly.
    """
    # --- Context routing: skip raw_text if general knowledge suffices ---
    needs_context = _needs_pdf_context(question, highlighted_text)

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
    )

    if parent_response is None:
        system_prompt = (
            "You are a helpful study assistant. Start by trying to answer the student's question using the content "
            "from the provided document. If the topic is not covered in the document, DO NOT say it is not covered. "
            "Instead, use your general knowledge to find and provide the correct answer. "
            "Be concise — the answer will appear in a 360px wide card. Use bullet points where appropriate. "
            "Do not repeat the question."
        )
    else:
        system_prompt = (
            "You are a helpful study assistant. Prefer the provided document as your primary source. "
            "If the document lacks relevant context, use your general knowledge — do not refuse to answer. "
            "Be concise — the answer will appear in a 360px wide card. Use bullet points where appropriate. "
            "Do not repeat the question."
        )

    if user_details:
        user_context_str = (
            f"User Context:\n"
            f"- Name: {getattr(user_details, 'name', '')}\n"
            f"- Age: {getattr(user_details, 'age', '')}\n"
            f"- Status: {getattr(user_details, 'status', '')}\n"
            f"- Education Level: {getattr(user_details, 'educationLevel', '')}\n"
        )
        system_prompt += f"\n\nKeep the following user context in mind to tailor your response:\n{user_context_str}"

    if needs_context:
        doc_section = f"Document content:\n{raw_text}\n\n---\n\n"
    else:
        doc_section = ""  # skip PDF — saves thousands of tokens for general-knowledge questions

    user_message = f"""{doc_section}Selected passage the student is asking about:
{highlighted_text}

---

Student's question:
{question}
"""

    if parent_response is not None:
        user_message += f"\n---\n\nPrior context (parent answer):\n{parent_response}"

    full_prompt = f"{system_prompt}\n\n{user_message}"

    if chat_history:
        history_str = "\n\nChat History for this question:\n"
        for msg in chat_history:
            # Handle both dict (if passed from FastAPI) or pydantic model
            role = msg.role if hasattr(msg, "role") else msg.get("role")
            content = msg.content if hasattr(msg, "content") else msg.get("content")
            history_str += f"- {role.capitalize()}: {content}\n"
        full_prompt += history_str

    full_prompt += f"\n\nNew follow-up question: {question}" if chat_history else ""

    try:
        response = await model.generate_content_async(full_prompt, stream=True)
        async for chunk in response:
            try:
                text = chunk.text
                if text:
                    yield text
            except ValueError:
                # Final chunk carries finish_reason but no text parts — safe to skip
                pass
    except Exception as e:
        logger.error(f"Gemini API streaming error: {str(e)}")
        yield f"\n\n[API Error: {str(e)}]"


from services.pdf_service import get_page_image_base64

def _make_image_part(img_b64: str) -> dict:
    """Convert a base64 JPEG string into the dictionary format Gemini expects."""
    return {
        "mime_type": "image/jpeg",
        "data": img_b64,
    }

async def extract_text_from_image_b64(img_b64: str) -> str:
    """
    Uses Gemini Vision to read substantive educational text from an image,
    ignoring page numbers and footers.
    """
    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = (
        "You are an OCR system. Extract ALL educational text, headings, bullet points, and "
        "substantive content visible in this image. "
        "CRITICAL: Skip page numbers, copyright footers, slide numbers, and purely decorative text. "
        "Return the extracted text only, no commentary."
    )
    contents = [_make_image_part(img_b64), prompt]
    try:
        response = await asyncio.to_thread(lambda: model.generate_content(contents))
        extracted = (response.text or "").strip()
        logger.info(f"OCR extracted {len(extracted)} chars from image")
        return extracted
    except Exception as e:
        logger.error(f"OCR Error: {e}")
        return ""

async def generate_quiz(
    struggling_nodes: list, 
    raw_text: str, 
    pdf_id: str | None = None,
    source_type: str = "struggling",
    page_index: int | None = None,
    page_content: str | None = None
) -> list[dict]:
    """
    Generates between 3 and 15 mixed-format (MCQ + short-answer) questions.
    Primary source is either the Gemini answers the student struggled with
    or the provided page content, depending on source_type.
    """
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
        ),
    )

    contents = []
    
    if source_type == "page":
        effective_content = (page_content or "").strip()
        # Strip the '## Page N' header that splitMarkdownByPage injects — it's not educational content
        import re as _re
        effective_content = _re.sub(r'^##\s*Page\s*\d+\s*', '', effective_content).strip()
        
        has_image = False
        if len(effective_content) < 50 and pdf_id and page_index is not None:
            img_b64 = get_page_image_base64(pdf_id, page_index)
            if img_b64:
                # Send the page image directly to Gemini as multimodal content
                # instead of doing an intermediate OCR extraction
                contents.append({"mime_type": "image/jpeg", "data": img_b64})
                has_image = True

        if len(effective_content) < 20 and not has_image:
            raise HTTPException(
                status_code=422,
                detail="This page appears to have no readable content. Please navigate to a different page and try again."
            )

        # Build context description depending on whether we have text, image, or both
        if has_image and len(effective_content) < 20:
            context_section = "(An image of the page is provided above. Base your questions on the visual content.)"
        elif has_image:
            context_section = f"Page text:\n{effective_content}\n\n(An image of the page is also provided for additional context.)"
        else:
            context_section = f"Page context:\n{effective_content}"

        prompt = (
            "You are an intelligent quiz generator for university students.\n\n"
            "A student wants to be tested on the following page content.\n\n"
            "Format Rules:\n"
            "  • Generate a default of 4 questions total. If there is a lot of content or complex concepts, intelligently decide to ask up to a maximum of 7 questions.\n"
            "  • Mix question types intelligently:\n"
            "      - Use 'mcq' when the concept has clearly defined, distinct alternatives "
            "(definitions, comparisons, cause-effect, best/worst choice).\n"
            "      - Use 'short_answer' when the concept requires explanation, reasoning, or "
            "open-ended understanding.\n"
            "  • For MCQ questions:\n"
            "      - Provide EXACTLY 4 options in the 'options' array.\n"
            "      - Set 'correct_option' to the 0-based index (0–3) of the correct option.\n"
            "      - Make distractors plausible but clearly wrong on reflection.\n"
            "  • For short_answer questions: leave 'options' as null and 'correct_option' as null.\n\n"
            f"{context_section}\n\n"
            "Return the questions as a JSON array. No markdown fencing, no extra keys.\n"
            "Each object must have exactly these keys: question (string), question_type ('mcq' or 'short_answer'), "
            "options (array of 4 strings for mcq, null for short_answer), "
            "correct_option (0-based integer for mcq, null for short_answer)."
        )
    else:
        # Limit raw_text to avoid Gemini token exhaustion (struggling nodes provide the primary context)
        truncated_raw = raw_text[:8000] if raw_text else ""
        num_topics = len(struggling_nodes)
        nodes_summary = "\n".join(
            f"- Highlighted passage: {n['highlighted_text']}\n"
            f"  Student's question:   {n['question']}\n"
            f"  Gemini's answer:      {n['answer']}"
            for n in struggling_nodes
        )
        prompt = (
            "You are an intelligent quiz generator for university students.\n\n"
            "A student has been studying and has marked certain topics as ones they are struggling with. "
            "For each struggling topic you are given three things:\n"
            "  1. The highlighted passage from the document\n"
            "  2. The question the student asked about it\n"
            "  3. The answer that was provided to the student\n\n"
            "CRITICAL RULE — Source Priority:\n"
            "  • The PRIMARY source for questions is the GEMINI ANSWER given to the student. "
            "Test whether the student understood and retained what the answer explained.\n"
            "  • If the topic appears in the PDF as well, you may draw on that overlap too.\n"
            "  • If the topic (e.g. macOS efficiency, a specific algorithm, a historical event) was "
            "covered in the Gemini answer but is NOT in the PDF, you MUST still test it — do NOT skip "
            "it or restrict yourself only to PDF content.\n\n"
            "Format Rules:\n"
            "  • Generate a default of 4 questions total. If the content is dense or there are many struggling topics, intelligently decide to ask up to a maximum of 7 questions.\n"
            "  • Mix question types intelligently:\n"
            "      - Use 'mcq' when the concept has clearly defined, distinct alternatives "
            "(definitions, comparisons, cause-effect, best/worst choice).\n"
            "      - Use 'short_answer' when the concept requires explanation, reasoning, or "
            "open-ended understanding.\n"
            "  • For MCQ questions:\n"
            "      - Provide EXACTLY 4 options in the 'options' array.\n"
            "      - Set 'correct_option' to the 0-based index (0–3) of the correct option.\n"
            "      - Make distractors plausible but clearly wrong on reflection.\n"
            "  • For short_answer questions: leave 'options' as null and 'correct_option' as null.\n\n"
            f"Struggling topics:\n{nodes_summary}\n\n"
            f"Document (secondary context only, first 8000 chars):\n{truncated_raw}\n\n"
            "Return the questions as a JSON array. No markdown fencing, no extra keys.\n"
            "Each object must have exactly these keys: question (string), question_type ('mcq' or 'short_answer'), "
            "options (array of 4 strings for mcq, null for short_answer), "
            "correct_option (0-based integer for mcq, null for short_answer)."
        )

        if len(raw_text.strip()) < 50 and pdf_id:
            page_indexes = set(n.get("page_index") for n in struggling_nodes if n.get("page_index") is not None)
            for p_idx in page_indexes:
                img_b64 = get_page_image_base64(pdf_id, p_idx)
                if img_b64:
                    contents.append({"mime_type": "image/jpeg", "data": img_b64})
            if page_indexes:
                prompt += "\n\n(Images of the relevant pages are provided since text was unavailable.)"

    contents.append(prompt)
    response = await asyncio.to_thread(lambda: model.generate_content(contents))
    text = response.text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text.strip())


async def generate_flashcards(
    struggling_nodes: list, 
    raw_text: str, 
    pdf_id: str | None = None,
    source_type: str = "struggling",
    page_index: int | None = None,
    page_content: str | None = None,
    existing_flashcards: list[str] | None = None
) -> list[dict]:
    """
    Generates flashcards based on struggling topics or page context depending on source_type.
    """
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
        ),
    )

    contents = []

    if existing_flashcards and len(existing_flashcards) > 0:
        existing_str = "\n".join(f"- {q}" for q in existing_flashcards)
        avoid_duplicates_instruction = f"\n\nIMPORTANT: Do NOT generate flashcards with questions similar to the ones already on the canvas:\n{existing_str}\n"
    else:
        avoid_duplicates_instruction = ""

    if source_type == "page":
        effective_content = (page_content or "").strip()
        # Strip the '## Page N' header that splitMarkdownByPage injects
        import re as _re
        effective_content = _re.sub(r'^##\s*Page\s*\d+\s*', '', effective_content).strip()
        
        has_image = False
        if len(effective_content) < 50 and pdf_id and page_index is not None:
            img_b64 = get_page_image_base64(pdf_id, page_index)
            if img_b64:
                # Send the page image directly to Gemini as multimodal content
                contents.append({"mime_type": "image/jpeg", "data": img_b64})
                has_image = True

        if len(effective_content) < 20 and not has_image:
            raise HTTPException(
                status_code=422,
                detail="This page appears to have no readable content. Please navigate to a different page and try again."
            )

        # Build context description depending on whether we have text, image, or both
        if has_image and len(effective_content) < 20:
            context_section = "(An image of the page is provided above. Base your flashcards on the visual content.)"
        elif has_image:
            context_section = f"Page text:\n{effective_content}\n\n(An image of the page is also provided for additional context.)"
        else:
            context_section = f"Page context:\n{effective_content}"

        prompt = (
            "You are an expert study-aid creator making flash cards for a university student.\n\n"
            "A student wants to review the key concepts from the following page content.\n\n"
            "Flash card rules:\n"
            "  • Create a minimum of 3 and up to a maximum of 5 flash cards total. Intelligently decide how many to generate based on the amount of content.\n"
            "  • The 'question' field (front of card): A concise, specific question that tests active recall of a key concept.\n"
            "    - Keep it SHORT \u2014 one sentence maximum.\n"
            "  \u2022 The 'answer' field (back of card): A clear, complete explanation the student can use to learn.\n"
            "    - 2-4 sentences. Not too short, not an essay.\n"
            "  \u2022 Do NOT add any intro text, markdown fencing, or extra keys.\n"
            f"{avoid_duplicates_instruction}\n"
            f"{context_section}\n\n"
            f"Return the flash cards as a JSON array of objects. "
            "Each object must have exactly two keys: \"question\" (string) and \"answer\" (string)."
        )
    else:
        # Limit raw_text to avoid token exhaustion — struggling nodes are the primary context
        truncated_raw = raw_text[:3000] if raw_text else ""
        nodes_summary = "\n".join(
            f"- Highlighted passage: {n['highlighted_text']}\n"
            f"  Student's question:   {n['question']}\n"
            f"  Gemini's answer:      {n['answer']}"
            for n in struggling_nodes
        )
        prompt = (
            "You are an expert study-aid creator making flash cards for a university student.\n\n"
            "A student has been studying and marked certain topics as ones they are struggling with. "
            "For each struggling topic you are given:\n"
            "  1. The highlighted passage from the document\n"
            "  2. The question the student asked about it\n"
            "  3. The answer that was provided to the student\n\n"
            "Your task is to create flash cards that will help the student ACTIVELY RECALL these topics.\n\n"
            "Flash card rules:\n"
            "  • Create a minimum of 3 and up to a maximum of 5 flash cards total. Intelligently decide how many to generate based on the amount of content and struggling topics.\n"
            "  • The 'question' field (front of card): A concise, specific question that tests active recall of the concept.\n"
            "    - Keep it SHORT — one sentence maximum.\n"
            "    - It should test the CORE concept, not trivia.\n"
            "  • The 'answer' field (back of card): A clear, complete explanation the student can use to learn.\n"
            "    - 2-4 sentences. Not too short, not an essay.\n"
            "    - Should directly answer the question and explain WHY/HOW if relevant.\n"
            "  • Each card must correspond to ONE distinct struggling topic (if possible, without exceeding the max limit).\n"
            "  • Do NOT add any intro text, markdown fencing, or extra keys.\n"
            f"{avoid_duplicates_instruction}\n"
            f"Struggling topics:\n{nodes_summary}\n\n"
            f"Document context (for reference):\n{truncated_raw}\n\n"
            "Return the flash cards as a JSON array of objects. "
            "Each object must have exactly two keys: \"question\" (string) and \"answer\" (string)."
        )

        if len(raw_text.strip()) < 50 and pdf_id:
            page_indexes = set(n.get("page_index") for n in struggling_nodes if n.get("page_index") is not None)
            for p_idx in page_indexes:
                img_b64 = get_page_image_base64(pdf_id, p_idx)
                if img_b64:
                    contents.append({"mime_type": "image/jpeg", "data": img_b64})
            if page_indexes:
                prompt += "\n\n(Images of the relevant pages are provided since text was unavailable.)"

    contents.append(prompt)
    response = await asyncio.to_thread(lambda: model.generate_content(contents))
    text = response.text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text.strip())


async def generate_page_quiz(page_content: str, pdf_id: str | None = None, page_index: int | None = None) -> list[str]:
    """
    Generates 3-5 short-answer questions based ONLY on the provided page content.
    No struggling nodes, no user context — pure page comprehension test.
    Returns a plain JSON array of question strings.
    """
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
        ),
    )

    import re as _re
    contents = []
    effective_content = (page_content or "").strip()
    # Strip the '## Page N' header injected by splitMarkdownByPage — not educational content
    effective_content = _re.sub(r'^##\s*Page\s*\d+\s*', '', effective_content).strip()
    
    has_image = False
    if len(effective_content) < 50 and pdf_id and page_index is not None:
        img_b64 = get_page_image_base64(pdf_id, page_index)
        if img_b64:
            # Send the page image directly to Gemini as multimodal content
            contents.append({"mime_type": "image/jpeg", "data": img_b64})
            has_image = True

    if len(effective_content) < 20 and not has_image:
        raise HTTPException(
            status_code=422,
            detail="This page appears to have no readable content. Please navigate to a page with text content and try again."
        )

    # Build context description depending on whether we have text, image, or both
    if has_image and len(effective_content) < 20:
        context_section = "(An image of the page is provided above. Base your questions on the visual content.)"
    elif has_image:
        context_section = f"Page text:\n{effective_content}\n\n(An image of the page is also provided for additional context.)"
    else:
        context_section = f"Page content:\n\n{effective_content}"

    prompt = (
        "You are an expert academic tutor creating a short comprehension quiz.\n\n"
        "Based ONLY on the page content below, generate between 2 and 5 concise short-answer "
        "questions that test a student's understanding of the key concepts on this page. Intelligently decide how many questions to ask based on the amount of content.\n\n"
        "Rules:\n"
        "- Use ONLY information from the provided page content. Do not introduce outside concepts.\n"
        "- Questions should be specific, not vague or generic.\n"
        "- Questions should require a sentence or two to answer properly.\n"
        "- Number the questions with the depth of understanding ranging from recall → application.\n"
        "- Output ONLY a JSON array of question strings. No explanation, no extra keys.\n"
        "- Example: [\"What is X?\", \"How does Y relate to Z?\", \"Why is W important?\"]\n\n"
        f"{context_section}"
    )

    contents.append(prompt)
    response = await asyncio.to_thread(lambda: model.generate_content(contents))
    text = response.text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    data = json.loads(text.strip())
    # Ensure we always return a flat list of strings
    if isinstance(data, list):
        return [str(q) for q in data]
    return []


async def grade_answer(
    question: str,
    student_answer: str,
    page_content: str,
    user_details: dict | None = None,
    pdf_id: str | None = None,
    page_index: int | None = None,
) -> str:
    """
    Grades a student's answer to a page-quiz question and returns direct, personalised
    feedback as a plain text string (not JSON).
    """
    model = genai.GenerativeModel("gemini-2.5-flash")

    personalisation = ""
    if user_details:
        name = user_details.get("name", "")
        age = user_details.get("age", "")
        status = user_details.get("status", "")
        level = user_details.get("educationLevel", "")
        if any([name, age, status, level]):
            personalisation = (
                f"\n\nStudent context (use to calibrate tone and depth):\n"
                f"- Name: {name}\n"
                f"- Age: {age}\n"
                f"- Status: {status}\n"
                f"- Education level: {level}\n"
            )

    prompt = (
        "You are a supportive academic tutor marking a student's answer to a page quiz question.\n\n"
        "Your feedback must:\n"
        "1. Address the student DIRECTLY using 'You' — never use third-person ('The student said...').\n"
        "2. Start by stating clearly whether the answer is correct, partially correct, or incorrect.\n"
        "3. If wrong or partial: explain exactly what was missing or incorrect, and give the correct answer.\n"
        "4. If correct: briefly affirm and add one interesting extension point from the page content.\n"
        "5. Be concise but genuinely helpful — 2-4 sentences is ideal.\n"
        "6. Do NOT use bullet points — write as flowing, natural prose.\n"
        f"{personalisation}\n\n"
        f"Page content (ground truth):\n{page_content}\n\n"
        f"Quiz question:\n{question}\n\n"
        f"Student's answer:\n{student_answer}\n\n"
        "Write your feedback now (plain text, no markdown, no JSON):"
    )

    import re as _re
    # Strip the '## Page N' header before checking if content is readable
    cleaned_page_content = _re.sub(r'^##\s*Page\s*\d+\s*', '', page_content.strip()).strip()
    contents = []
    if len(cleaned_page_content) < 50 and pdf_id and page_index is not None:
        img_b64 = get_page_image_base64(pdf_id, page_index)
        if img_b64:
            contents.append({"mime_type": "image/jpeg", "data": img_b64})
            prompt += "\n\n(No readable text was found, so an image of the page is provided instead.)"

    contents.append(prompt)

    response = await asyncio.to_thread(
        lambda: model.generate_content(
            contents,
            generation_config=genai.GenerationConfig(max_output_tokens=8192, temperature=0.4),
        )
    )
    try:
        return response.text.strip()
    except ValueError:
        try:
            return response.candidates[0].content.parts[0].text.strip()
        except Exception:
            return "Unable to grade your answer at this time. Please try again."


async def validate_answer(
    question: str,
    student_answer: str,
    raw_text: str,
    question_type: str = "short_answer",
    correct_option: int | None = None,
) -> dict:
    """
    Validates a student's answer.
    For MCQ: the student_answer is the index (as a string) of the option they selected.
             We compare directly against correct_option — no Gemini call needed.
    For short_answer: uses Gemini to grade the free-text answer.
    """
    # ── MCQ: pure index comparison, no LLM needed ──────────────────────────
    if question_type == "mcq" and correct_option is not None:
        try:
            selected = int(student_answer)
        except (ValueError, TypeError):
            selected = -1
        is_correct = selected == correct_option
        return {
            "status": "correct" if is_correct else "incorrect",
            "explanation": (
                "Great job! That's the correct answer."
                if is_correct
                else f"Actually, the correct answer was choice {correct_option + 1}. Review this topic once more!"
            ),
        }

    # ── Short answer: ask Gemini ────────────────────────────────────────────
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
        ),
    )

    prompt = (
        "You are a supportive university teacher grading a study quiz. "
        "Evaluate whether the student's answer is correct.\n\n"
        "Status Selection:\n"
        "- 'correct': The answer matches the core content accurately.\n"
        "- 'partial': The answer contains some correct points but is incomplete or has minor inaccuracies.\n"
        "- 'incorrect': The answer is fundamentally wrong or entirely misses the point.\n\n"
        "Guidelines for your 'explanation':\n"
        "1. Address the student DIRECTLY using 'You' or 'Your'.\n"
        "2. NEVER use third-person phrases like 'The student said' or 'They stated'.\n"
        "3. Act as a patient mentor explaining the concept clearly, especially if they are wrong or only partially right.\n"
        "4. Be concise but helpful.\n\n"
        f"Document context (for reference):\n{raw_text}\n\n"
        f"Question:\n{question}\n\n"
        f"Student's Answer:\n{student_answer}\n\n"
        "Respond with a JSON object with exactly two keys:\n"
        "  \"status\": one of \"correct\", \"partial\", or \"incorrect\"\n"
        "  \"explanation\": a concise string addressed directly to the student\n"
        "No markdown fencing, no extra keys."
    )

    response = await asyncio.to_thread(model.generate_content, prompt)
    return json.loads(response.text)


async def image_to_text(base64_image: str) -> str:
    """
    Takes a base64 encoded image string (e.g., from a user's bounding box snip),
    sends it to Gemini Vision, and extracts the text exactly as it appears.
    """
    # Remove data URI prefix if present
    if "base64," in base64_image:
        base64_image = base64_image.split("base64,")[1]
        
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    prompt = (
        "You are an expert Optical Character Recognition (OCR) assistant.\n"
        "Please extract all the text exactly as it appears in the provided image.\n"
        "Rules:\n"
        "1. Output ONLY the extracted text.\n"
        "2. Preserve the original formatting, line breaks, and punctuation as best as possible.\n"
        "3. Do not add any conversational filler, markdown fencing, or explanations."
    )
    
    response = await asyncio.to_thread(
        lambda: model.generate_content(
            [
                {"mime_type": "image/jpeg", "data": base64_image},
                prompt
            ],
            generation_config=genai.GenerationConfig(temperature=0.1),
        )
    )
    try:
        return response.text.strip()
    except ValueError:
        try:
            return response.candidates[0].content.parts[0].text.strip()
        except Exception:
            return ""
