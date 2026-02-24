import os
import tempfile
import uuid
import re
from fastapi import UploadFile
from pathlib import Path


# Directory for persistent PDF storage
PDF_STORAGE_DIR = Path(__file__).parent.parent / "pdf_storage"


async def save_temp_file(file: UploadFile) -> str:
    """
    Async-safe: reads the uploaded file bytes without blocking the event loop.
    Returns the path to the saved temp file.
    """
    suffix = os.path.splitext(file.filename or "upload")[1] or ".pdf"
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(tmp_fd, "wb") as tmp:
            # await file.read() is the async-safe path; does not stall uvicorn.
            content = await file.read()
            tmp.write(content)
    except Exception:
        raise
    return tmp_path


def delete_file(path: str) -> None:
    """
    Deletes the file at the given path.
    Silently passes if the file does not exist or (on Windows) the handle
    is still held — the OS will clean it up from the temp dir regardless.
    """
    try:
        os.remove(path)
    except (FileNotFoundError, PermissionError):
        pass


async def save_pdf_file(file: UploadFile) -> str:
    """
    Saves a PDF file to persistent storage and returns the file ID.
    The file can later be retrieved using the returned file ID.
    """
    # Ensure storage directory exists
    PDF_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate unique file ID
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename or "upload")[1] or ".pdf"
    stored_filename = f"{file_id}{file_ext}"
    stored_path = PDF_STORAGE_DIR / stored_filename
    
    # Read and save file
    content = await file.read()
    with open(stored_path, "wb") as f:
        f.write(content)
    
    return file_id


def get_pdf_path(file_id: str) -> Path | None:
    """
    Returns the path to a stored PDF file by its ID.
    Returns None if the file doesn't exist.
    """
    # Sanitize file_id to prevent path traversal
    if not re.match(r"^[a-zA-Z0-9_-]+$", file_id):
        return None

    # Try common extensions
    for ext in [".pdf", ""]:
        path = PDF_STORAGE_DIR / f"{file_id}{ext}"
        if path.exists():
            return path
    return None


def delete_pdf_file(file_id: str) -> bool:
    """
    Deletes a stored PDF file by its ID.
    Returns True if the file was deleted, False if it didn't exist.
    """
    path = get_pdf_path(file_id)
    if path:
        try:
            os.remove(path)
            return True
        except (FileNotFoundError, PermissionError):
            return False
    return False
