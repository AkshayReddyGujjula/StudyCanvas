import fitz  # PyMuPDF


def extract_text(file_path: str) -> tuple[str, int]:
    """
    Opens a PDF with PyMuPDF, extracts text from all pages joined by ---,
    returns (raw_text, page_count).
    Raises ValueError("empty_text") if the PDF has no extractable text.
    """
    doc = fitz.open(file_path)
    page_count = len(doc)
    pages = []
    for page in doc:
        pages.append(page.get_text())
    raw_text = "\n---\n".join(pages)

    if not raw_text.strip():
        raise ValueError("empty_text")

    return raw_text, page_count
