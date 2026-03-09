import os
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from rate_limiter import limiter

load_dotenv()

from routes import upload, query, quiz, page_quiz, flashcards, ocr, transcription, quiz_followup, convert, code_assist

logger = logging.getLogger(__name__)
app = FastAPI(title="StudyCanvas API")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error("422 Validation error on %s %s: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

# Allow localhost in dev and any Vercel deployment in production.
# Set ALLOWED_ORIGINS env var to a comma-separated list to restrict origins.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # Restrict to strictly alphanumeric preview subdomains and standard custom domains
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.vercel\.app|studycanvas\.app|www\.studycanvas\.app)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Model-Used"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(query.router, prefix="/api")
app.include_router(quiz.router, prefix="/api")
app.include_router(page_quiz.router, prefix="/api")
app.include_router(flashcards.router, prefix="/api")
app.include_router(ocr.router, prefix="/api")
app.include_router(transcription.router, prefix="/api")
app.include_router(quiz_followup.router, prefix="/api")
app.include_router(convert.router, prefix="/api")
app.include_router(code_assist.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
