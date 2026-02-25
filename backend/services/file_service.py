import os
import tempfile
import uuid
import re
from fastapi import UploadFile
from pathlib import Path


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
