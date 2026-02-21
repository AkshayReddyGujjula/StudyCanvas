import re
import fitz  # PyMuPDF

# Extraction flags: expand ligatures (fi, ti, tt etc.) into real characters,
# preserve whitespace, and dehyphenate split words across lines.
_EXTRACT_FLAGS = (
    fitz.TEXT_PRESERVE_WHITESPACE
    | fitz.TEXT_DEHYPHENATE
    # NOTE: TEXT_PRESERVE_LIGATURES is intentionally NOT set so that
    # ligature glyphs (fi, ti, tt …) are decomposed to their real letters.
)


def clean_ligature_errors(text: str) -> str:
    """
    Cleans up common PDF ligature extraction errors where certain letters
    are replaced by special characters due to font encoding issues.
    """
    # Replace 3 or $ with 'ti' when surrounded by letters (e.g., 'introduc3on' -> 'introduction')
    text = re.sub(r'(?<=[a-zA-Z])[3$](?=[a-zA-Z])', 'ti', text)
    # Replace = with 'tt' when surrounded by letters (e.g., 'wri=en' -> 'written')
    text = re.sub(r'(?<=[a-zA-Z])=(?=[a-zA-Z])', 'tt', text)
    return text


def extract_text(file_path: str) -> tuple[str, int]:
    """
    Opens a PDF with PyMuPDF, extracts text from all pages joined by ---,
    returns (raw_text, page_count).
    Raises ValueError("empty_text") if the PDF has no extractable text.

    Uses _EXTRACT_FLAGS to decompose ligatures so that characters like
    'fi', 'ti', 'tt' are not replaced by £/$=/3 etc.
    """
    doc = fitz.open(file_path)
    page_count = len(doc)
    pages = []
    for page in doc:
        pages.append(page.get_text(flags=_EXTRACT_FLAGS))
    raw_text = "\n---\n".join(pages)

    # Clean up extraction errors for ligatures before processing further
    raw_text = clean_ligature_errors(raw_text)

    if not raw_text.strip():
        raise ValueError("empty_text")

    return raw_text, page_count
