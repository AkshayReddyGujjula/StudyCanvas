from fastapi import APIRouter, HTTPException
from models.schemas import FlashcardsRequest, Flashcard
from services.gemini_service import generate_flashcards

router = APIRouter()


@router.post("/flashcards", response_model=list[Flashcard])
async def create_flashcards(request: FlashcardsRequest):
    """
    Generate flash cards from the student's struggling nodes.
    Returns a list of { question, answer } objects — one card per struggling topic.
    """
    if not request.struggling_nodes:
        raise HTTPException(status_code=400, detail="No struggling nodes provided.")

    nodes_payload = [
        {
            "highlighted_text": n.highlighted_text,
            "question": n.question,
            "answer": n.answer,
            "page_index": n.page_index,
        }
        for n in request.struggling_nodes
    ]

    try:
        cards = await generate_flashcards(nodes_payload, request.raw_text, pdf_id=request.pdf_id)
        return cards
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Flash card generation failed: {str(e)}")
