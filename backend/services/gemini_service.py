import os
import json
import logging
import asyncio
import google.generativeai as genai
from models.schemas import QuizQuestion

logger = logging.getLogger(__name__)

# Initialise the Gemini client once at module level
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))


def convert_to_markdown(raw_text: str) -> str:
    """
    Sends the raw extracted PDF text to Gemini and returns structured Markdown.
    Preserves all content; inserts ## Page X headers at --- separators.
    """
    model = genai.GenerativeModel("gemini-2.0-flash")
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


def stream_query(question: str, highlighted_text: str, raw_text: str, parent_response: str | None):
    """
    Synchronous generator that streams the Gemini response for a student query.
    Uses model.generate_content(stream=True) — blocking and synchronous.
    FastAPI wraps synchronous generators in iterate_in_threadpool().
    """
    model = genai.GenerativeModel("gemini-2.0-flash")

    if parent_response is None:
        system_prompt = (
            "You are a helpful study assistant. Answer the student's question using ONLY the content "
            "from the provided document. Be concise — the answer will appear in a 360px wide card. "
            "Use bullet points where appropriate. If the topic is not covered in the document, "
            "say so clearly in one sentence. Do not repeat the question."
        )
    else:
        system_prompt = (
            "You are a helpful study assistant. Prefer the provided document as your primary source. "
            "If the document lacks relevant context, use your general knowledge — do not refuse to answer. "
            "Be concise — the answer will appear in a 360px wide card. Use bullet points where appropriate. "
            "Do not repeat the question."
        )

    user_message = f"""Document content:
{raw_text}

---

Selected passage the student is asking about:
{highlighted_text}

---

Student's question:
{question}
"""

    if parent_response is not None:
        user_message += f"\n---\n\nPrior context (parent answer):\n{parent_response}"

    full_prompt = f"{system_prompt}\n\n{user_message}"

    response = model.generate_content(full_prompt, stream=True)
    for chunk in response:
        if chunk.text:
            yield chunk.text


async def generate_quiz(struggling_nodes: list, raw_text: str) -> list[dict]:
    """
    Generates 4 multiple-choice quiz questions based on struggling nodes and document content.
    Uses response_mime_type='application/json' with response_schema for structured output.
    Wraps the blocking Gemini call in asyncio.to_thread to avoid blocking the event loop.
    """
    model = genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=list[QuizQuestion],
        ),
    )

    nodes_summary = "\n".join(
        f"- Topic: {n['highlighted_text']}\n  Question: {n['question']}\n  Answer: {n['answer']}"
        for n in struggling_nodes
    )

    prompt = (
        "You are a quiz generator for university students. "
        "Generate exactly 4 multiple-choice questions to help a student review the topics they are struggling with.\n\n"
        f"Topics the student is struggling with:\n{nodes_summary}\n\n"
        f"Source document (for context):\n{raw_text[:8000]}\n\n"
        "Each question must have:\n"
        "- question: a clear, specific question string\n"
        "- options: a dict with keys A, B, C, D — each a distinct answer option string\n"
        "- answer: one of 'A', 'B', 'C', or 'D' — the correct answer key\n"
        "- explanation: a 1-2 sentence explanation of why the correct answer is right\n\n"
        "Return exactly 4 questions. No markdown fencing."
    )

    # Run blocking Gemini call in a thread to avoid freezing the asyncio event loop
    response = await asyncio.to_thread(model.generate_content, prompt)
    return json.loads(response.text)
