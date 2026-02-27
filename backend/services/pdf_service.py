import re
import unicodedata
import pypdf

# Try to import pymupdf4llm for high-quality Markdown extraction.
# Falls back to pypdf (plain text) when PyMuPDF is unavailable (e.g. Vercel).
try:
    import pymupdf4llm
    import pymupdf
    _HAS_PYMUPDF = True
except ImportError:
    _HAS_PYMUPDF = False

# Explicit map for Unicode ligature characters that some PDF fonts emit instead
# of their decomposed letter equivalents. Applied before NFKC normalisation so
# any that survive the PDF extraction are caught regardless.
_LIGATURE_CHAR_MAP: dict[str, str] = {
    # Standard Unicode Alphabetic Presentation Forms (U+FB00–U+FB06)
    '\ufb00': 'ff',   # ﬀ  LATIN SMALL LIGATURE FF
    '\ufb01': 'fi',   # ﬁ  LATIN SMALL LIGATURE FI
    '\ufb02': 'fl',   # ﬂ  LATIN SMALL LIGATURE FL
    '\ufb03': 'ffi',  # ﬃ  LATIN SMALL LIGATURE FFI
    '\ufb04': 'ffl',  # ﬄ  LATIN SMALL LIGATURE FFL
    '\ufb05': 'st',   # ﬅ  LATIN SMALL LIGATURE LONG S T
    '\ufb06': 'st',   # ﬆ  LATIN SMALL LIGATURE ST
    # Private Use Area codepoints some PDF generators use for ligatures
    # instead of the standard U+FBxx slots (common in older LaTeX-tool PDFs)
    '\uf001': 'fi',
    '\uf002': 'fl',
    '\uf000': 'ff',
    '\uf003': 'ffi',
    '\uf004': 'ffl',
    # NULL byte — rare but possible in malformed PDFs
    '\u0000': '',
}


def _clean(text: str) -> str:
    """
    Fix font-encoding artifacts that PDF text extraction produces from the raw PDF.

    Many PDFs with Type1/TrueType fonts have broken or non-standard encoding
    tables that map ligature glyphs to wrong Unicode code points.  The set of
    wrong code points varies by PDF tool and font, so we cover every documented
    variant observed in practice:

      Ligature  Known wrong code points
      --------  -----------------------------------------------
      'ti'      U+0033 '3', U+0024 '$', U+003B ';'
      'tt'      U+003D '=', U+002C ','
      'fi/fl'   U+FB01/U+FB02 (standard), U+F001/U+F002 (PUA)
      'ff/ffi'  U+FB00/U+FB03 (standard), U+F000/U+F003 (PUA)

    Corrections are applied in five passes:

    1. Explicit char map — replaces Unicode ligature / PUA code points.
    2. NFKC normalise   — decomposes remaining compatibility characters.
    3. 'ti' regex       — '3', '$', ';' flanked by ASCII letters → 'ti'.
    4. 'tt' regex       — '=', ',' flanked by ASCII letters → 'tt'.
       (flanking requirement prevents false positives on legitimate
        punctuation such as 'x = y', '3 items', 'price, tax', 'e.g.,').
    5. Control-char strip — removes null bytes and non-printable ASCII
       control characters (keeps \\t \\n \\r).
    """
    # Pass 1: explicit Unicode ligature / PUA map
    for char, replacement in _LIGATURE_CHAR_MAP.items():
        if char in text:
            text = text.replace(char, replacement)

    # Pass 2: NFKC normalisation
    text = unicodedata.normalize('NFKC', text)

    # Pass 3: 'ti' ligature artifacts flanked by letters
    # Covers: '3' (e.g. 'introduc3on'), '$' (e.g. 'introduc$on'),
    #         ';' (e.g. 'sec;on' → 'section', 'func;on' → 'function')
    text = re.sub(r'(?<=[a-zA-Z])[3$;](?=[a-zA-Z])', 'ti', text)

    # Pass 4: 'tt' ligature artifacts flanked by letters
    # Covers: '=' (e.g. 'wri=en' → 'written'),
    #         ',' (e.g. 'overwri,en' → 'overwritten', 'be,er' → 'better')
    text = re.sub(r'(?<=[a-zA-Z])[=,](?=[a-zA-Z])', 'tt', text)

    # Pass 5: strip non-printable control characters (keep \t \n \r)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

    return text


def extract_text_and_markdown(file_path: str) -> tuple[str, str, int, str|None]:
    """
    Opens a PDF and extracts both:
      - raw_text         : cleaned plain text per page, for downstream Gemini
                           endpoints (quiz / flashcards / query context).
      - markdown_content : per-page Markdown with '## Page N' headers prepended
                           so the frontend splitMarkdownByPage() regex works.

    Uses pymupdf4llm when available (produces excellent structured Markdown with
    proper headings, lists, tables, bold/italic). Falls back to pypdf otherwise.

    Raises ValueError("empty_text") if the PDF has no extractable text at all.
    Returns (raw_text, markdown_content, page_count, new_pdf_path).
    new_pdf_path is always None (server-side PDF modification not used on Vercel).
    """
    if _HAS_PYMUPDF:
        return _extract_with_pymupdf(file_path)
    return _extract_with_pypdf(file_path)


def _clean_markdown(text: str) -> str:
    """
    Clean up pymupdf4llm Markdown output:
    - Remove image references (we don't serve images)
    - Clean ligature / encoding artifacts
    - Collapse excessive blank lines
    """
    # Remove markdown image references (![alt](path)) since images aren't served
    text = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', text)
    # Apply standard ligature/encoding cleanup
    text = _clean(text)
    # Collapse 3+ consecutive blank lines into 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _extract_with_pymupdf(file_path: str) -> tuple[str, str, int, str|None]:
    """High-quality extraction using pymupdf4llm for structured Markdown."""
    doc = pymupdf.open(file_path)
    page_count = len(doc)

    # Get raw plain text for downstream Gemini endpoints (quiz, flashcards, etc.)
    raw_pages: list[str] = []
    for page in doc:
        raw_pages.append(_clean(page.get_text()))
    doc.close()

    raw_text = "\n\n".join(raw_pages)

    # Get per-page structured Markdown using pymupdf4llm.
    # page_chunks=True returns a list of dicts, one per page.
    chunks = pymupdf4llm.to_markdown(file_path, page_chunks=True)
    md_pages: list[str] = []
    for i, chunk in enumerate(chunks):
        page_md = chunk['text'].strip() if isinstance(chunk, dict) else str(chunk).strip()
        page_md = _clean_markdown(page_md)
        md_pages.append(f"## Page {i + 1}\n\n{page_md}")

    markdown_content = "\n\n".join(md_pages)
    return raw_text, markdown_content, page_count, None


def _extract_with_pypdf(file_path: str) -> tuple[str, str, int, str|None]:
    """Fallback extraction using pypdf (plain text, less formatting)."""
    reader = pypdf.PdfReader(file_path)
    page_count = len(reader.pages)

    raw_pages: list[str] = []
    md_pages: list[str] = []

    for i, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        cleaned = _clean(page_text)
        raw_pages.append(cleaned)
        # Improve plain-text formatting for better Markdown rendering
        formatted = _format_plain_text(cleaned)
        md_pages.append(f"## Page {i + 1}\n\n{formatted}")

    raw_text = "\n\n".join(raw_pages)
    markdown_content = "\n\n".join(md_pages)

    return raw_text, markdown_content, page_count, None


def _format_plain_text(text: str) -> str:
    """
    Improve raw extracted plain text for Markdown rendering.
    Detects paragraph boundaries and inserts proper double-newlines so
    the Markdown renderer doesn't collapse everything into one paragraph.
    """
    lines = text.split('\n')
    result: list[str] = []

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            # Preserve existing blank lines as paragraph breaks
            if result and result[-1] != '':
                result.append('')
            continue

        result.append(stripped)

        # Heuristic: insert a paragraph break after a line ending with
        # sentence-finalising punctuation when the next line starts with
        # an uppercase letter (likely a new paragraph).
        if i + 1 < len(lines):
            next_stripped = lines[i + 1].strip()
            if (next_stripped
                and stripped.endswith(('.', '!', '?', ':'))
                and next_stripped[0].isupper()):
                result.append('')  # blank line = paragraph break

    text = '\n'.join(result)
    # Collapse 3+ newlines to 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def get_page_image_base64(pdf_id: str, page_index: int) -> str | None:
    """
    Server-side PDF image rendering is not available on Vercel serverless.
    Always returns None — Gemini Vision will use the image_base64 sent directly
    by the frontend (via the PDFViewer canvas snapshot) when available.
    """
    return None
