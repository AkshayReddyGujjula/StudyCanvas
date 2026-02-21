from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routes import upload, query, quiz

app = FastAPI(title="StudyCanvas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(query.router, prefix="/api")
app.include_router(quiz.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
