from fastapi import APIRouter, HTTPException, Request
from models.schemas import FlashcardsRequest, Flashcard
from rate_limiter import limiter
from services.gemini_service import generate_flashcards

router = APIRouter()


@router.post("/flashcards", response_model=list[Flashcard])
@limiter.limit("10/minute; 100/hour; 500/day")
async def create_flashcards(request: Request, payload: FlashcardsRequest):
    """
    Generate flash cards from the student's struggling nodes.
    Returns a list of { question, answer } objects — one card per struggling topic.
    """
    if payload.source_type == "struggling" and not payload.struggling_nodes:
        raise HTTPException(status_code=400, detail="No struggling nodes provided.")

    nodes_payload = [
        {
            "highlighted_text": n.highlighted_text,
            "question": n.question,
            "answer": n.answer,
            "page_index": n.page_index,
        }
        for n in payload.struggling_nodes
    ]

    try:
        cards = await generate_flashcards(
            nodes_payload,
            payload.raw_text,
            pdf_id=payload.pdf_id,
            source_type=payload.source_type,
            page_index=payload.page_index,
            page_content=payload.page_content,
            existing_flashcards=payload.existing_flashcards
        )
        return cards
    except Exception as e:
        import logging
        logging.error(f"Flash card generation failed: {e}")
        raise HTTPException(status_code=500, detail="Flash card generation failed due to an internal error.")
