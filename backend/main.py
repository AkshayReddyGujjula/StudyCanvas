import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routes import upload, query, quiz, page_quiz, flashcards, ocr

app = FastAPI(title="StudyCanvas API")

# Allow localhost in dev and any Vercel deployment in production.
# Set ALLOWED_ORIGINS env var to a comma-separated list to restrict origins.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # Also allow any *.vercel.app preview URL and the custom domain
    allow_origin_regex=r"https://(.*\.vercel\.app|studycanvas\.app|www\.studycanvas\.app)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(query.router, prefix="/api")
app.include_router(quiz.router, prefix="/api")
app.include_router(page_quiz.router, prefix="/api")
app.include_router(flashcards.router, prefix="/api")
app.include_router(ocr.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
