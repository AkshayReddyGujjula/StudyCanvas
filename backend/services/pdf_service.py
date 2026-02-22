import re
import unicodedata
import fitz  # PyMuPDF (pulled in by pymupdf4llm)
import pymupdf4llm

# Extraction flags: dehyphenate split words across lines and preserve whitespace.
_EXTRACT_FLAGS = fitz.TEXT_PRESERVE_WHITESPACE | fitz.TEXT_DEHYPHENATE

# Explicit map for Unicode ligature characters that some PDF fonts emit instead
# of their decomposed letter equivalents. Applied before NFKC normalisation so
# any that survive PyMuPDF's extraction are caught regardless.
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
    Fix font-encoding artifacts that pymupdf4llm inherits from the raw PDF.

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


def extract_text_and_markdown(file_path: str) -> tuple[str, str, int]:
    """
    Opens a PDF with PyMuPDF and extracts both:
      - raw_text         : cleaned plain text per page, for downstream Gemini
                           endpoints (quiz / flashcards / query context).
      - markdown_content : per-page Markdown from pymupdf4llm with encoding
                           artifacts cleaned, and '## Page N' headers prepended
                           so the frontend splitMarkdownByPage() regex works.

    Raises ValueError("empty_text") if the PDF has no extractable text.
    Returns (raw_text, markdown_content, page_count).
    """
    doc = fitz.open(file_path)
    try:
        page_count = len(doc)

        raw_pages: list[str] = []
        md_pages: list[str] = []

        for i, page in enumerate(doc):
            # Plain text — use dehyphenate + preserve-whitespace flags, then
            # run the encoding cleaner so artifacts like '3'/'$'/'=' are fixed.
            raw_pages.append(_clean(page.get_text(flags=_EXTRACT_FLAGS)))

            # Structured Markdown via pymupdf4llm, then apply the same cleaner
            # so the displayed content is also free of encoding artifacts.
            page_md = _clean(pymupdf4llm.to_markdown(doc, pages=[i]))

            # Prepend the ## Page N header the frontend relies on.
            md_pages.append(f"## Page {i + 1}\n\n{page_md.strip()}")

        raw_text = "\n\n".join(raw_pages)
        markdown_content = "\n\n".join(md_pages)
    finally:
        # Always close so the OS file handle (and Windows exclusive lock) is
        # released before the caller tries to delete the temp file.
        doc.close()

    if not raw_text.strip():
        raise ValueError("empty_text")

    return raw_text, markdown_content, page_count
