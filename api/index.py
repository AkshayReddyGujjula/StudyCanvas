import sys
import os

# Add the backend directory to the path so we can import the FastAPI app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from main import app  # noqa: F401 — Vercel detects the 'app' ASGI variable automatically
