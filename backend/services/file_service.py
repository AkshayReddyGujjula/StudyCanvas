import os
import tempfile
from fastapi import UploadFile


def save_temp_file(file: UploadFile) -> str:
    """
    Writes the uploaded file bytes to a temporary path in /tmp/ (or OS temp dir).
    Returns the path to the saved file.
    """
    suffix = os.path.splitext(file.filename or "upload")[1] or ".pdf"
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(tmp_fd, "wb") as tmp:
            content = file.file.read()
            tmp.write(content)
    except Exception:
        os.close(tmp_fd)
        raise
    return tmp_path


def delete_file(path: str) -> None:
    """
    Deletes the file at the given path. Silently passes if file does not exist.
    """
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
