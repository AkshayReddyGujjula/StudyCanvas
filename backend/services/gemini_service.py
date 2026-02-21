import os
import json
import logging
import asyncio
import google.generativeai as genai
from models.schemas import QuizQuestion, ValidateAnswerResponse

logger = logging.getLogger(__name__)

# Initialise the Gemini client once at module level
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))


def convert_to_markdown(raw_text: str) -> str:
    """
    Sends the raw extracted PDF text to Gemini and returns structured Markdown.
    Preserves all content; inserts ## Page X headers at --- separators.
    """
    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = (
        "You are a document formatting assistant. Convert the following raw text extracted from a PDF "
        "into well-structured Markdown.\n\n"
        "Rules:\n"
        "- Preserve ALL content exactly — do not summarise, omit, or paraphrase anything.\n"
        "- Restore proper headings using # for main titles and ## for sub-sections.\n"
        "- Convert list items into proper Markdown bullet lists using -.\n"
        "- Preserve bold/italic emphasis where it is clearly implied.\n"
        "- At every occurrence of a line containing only '---', replace it with a ## Page X header "
        "(where X increments starting from 1 for the first --- separator, meaning Page 2 comes after the first ---, etc.).\n"
        "- Do not add any preamble or explanation — output only the Markdown.\n\n"
        f"Raw text:\n\n{raw_text}"
    )
    response = model.generate_content(prompt)
    return response.text


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
            if chunk.text:
                yield chunk.text
    except Exception as e:
        logger.error(f"Gemini API streaming error: {str(e)}")
        yield f"\n\n[API Error: {str(e)}]"


async def generate_quiz(struggling_nodes: list, raw_text: str) -> list[dict]:
    """
    Generates between 3 and 15 short-answer questions based on struggling nodes.
    Uses response_mime_type='application/json' with response_schema for structured output.
    Wraps the blocking Gemini call in asyncio.to_thread to avoid blocking the event loop.
    """
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=list[QuizQuestion],
        ),
    )

    nodes_summary = "\n".join(
        f"- Topic: {n['highlighted_text']}\n  Question: {n['question']}\n  Answer: {n['answer']}"
        for n in struggling_nodes
    )

    # Determine optimal question count based on number of struggling topics
    num_topics = len(struggling_nodes)
    num_questions = min(max(3, num_topics * 3), 15)

    prompt = (
        "You are a quiz generator for university students. "
        f"Generate exactly {num_questions} short-answer questions to help a student review the topics they are struggling with.\n\n"
        f"Topics the student is struggling with:\n{nodes_summary}\n\n"
        f"Source document for full context:\n{raw_text}\n\n"
        "Each question must have:\n"
        "- question: a clear, specific short-answer question string\n\n"
        f"Return exactly {num_questions} questions. No markdown fencing."
    )

    # Run blocking Gemini call in a thread to avoid freezing the asyncio event loop
    response = await asyncio.to_thread(model.generate_content, prompt)
    return json.loads(response.text)


async def validate_answer(question: str, student_answer: str, raw_text: str) -> dict:
    """
    Validates a student's answer to a short-answer question against the source document.
    """
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=ValidateAnswerResponse,
        ),
    )

    prompt = (
        "You are a university grader. Based on the provided source document context, evaluate "
        "whether the student's answer to the question is correct. "
        "Provide a boolean 'is_correct' (true if right, false if wrong) and a short 'explanation' "
        "explaining why it is right or wrong based on the document.\n\n"
        f"Document:\n{raw_text}\n\n"
        f"Question:\n{question}\n\n"
        f"Student's Answer:\n{student_answer}\n"
    )

    response = await asyncio.to_thread(model.generate_content, prompt)
    return json.loads(response.text)
