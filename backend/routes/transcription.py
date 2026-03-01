import logging
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from rate_limiter import limiter
from services import gemini_service
from services.gemini_service import MODEL_LITE

logger = logging.getLogger(__name__)
router = APIRouter()

# Allowed audio MIME types. We only accept formats that browsers can produce
# via MediaRecorder and that the Gemini API can process.
ALLOWED_MIME_TYPES = {
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg",
    "audio/ogg;codecs=opus",
    "audio/mpeg",
}

# ~9 MB of raw audio ≈ ~12 million base64 chars — generous but prevents abuse
MAX_AUDIO_B64_LEN = 12_000_000


class TranscribeRequest(BaseModel):
    audio_base64: str = Field(
        ...,
        max_length=MAX_AUDIO_B64_LEN,
        description="Raw base64-encoded audio data (no data-URL prefix)",
    )
    mime_type: str = Field(
        ...,
        max_length=80,
        description="MIME type of the audio, e.g. 'audio/webm;codecs=opus'",
    )

    @field_validator("mime_type")
    @classmethod
    def validate_mime(cls, v: str) -> str:
        # Normalise and validate
        normalised = v.strip().lower()
        if normalised not in ALLOWED_MIME_TYPES:
            raise ValueError(
                f"Unsupported audio MIME type '{v}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}"
            )
        return normalised

    @field_validator("audio_base64")
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("audio_base64 must not be empty")
        return v


class TranscribeResponse(BaseModel):
    text: str
    model_used: str = ""


@router.post("/transcribe", response_model=TranscribeResponse)
@limiter.limit("3/minute; 10/hour; 30/day")
async def transcribe_audio(request: Request, payload: TranscribeRequest):
    """
    Receives a base64-encoded audio clip from the client and returns the
    transcribed text produced by Gemini Flash Lite.

    Rate limited tightly (3/min, 10/hr, 30/day) because audio tokens are the
    most expensive modality and we want to prevent abuse / accidental spam.
    """
    try:
        text = await gemini_service.transcribe_audio(
            payload.audio_base64, payload.mime_type
        )
        return TranscribeResponse(text=text, model_used=MODEL_LITE)
    except ValueError as exc:
        # Validation errors from the Pydantic model surface here
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Transcription error: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to transcribe audio due to an internal error.",
        )
