import re
import unicodedata
import fitz  # PyMuPDF

# Extraction flags: expand ligatures (fi, ti, tt etc.) into real characters,
# preserve whitespace, and dehyphenate split words across lines.
_EXTRACT_FLAGS = (
    fitz.TEXT_PRESERVE_WHITESPACE
    | fitz.TEXT_DEHYPHENATE
    # NOTE: TEXT_PRESERVE_LIGATURES is intentionally NOT set so that
    # ligature glyphs (fi, ti, tt …) are decomposed to their real letters.
)

# Explicit map for Unicode ligature characters and other code points that are
# commonly misused by PDF font encodings.  Applied before NFKC normalisation
# so that any that survive PyMuPDF are caught regardless.
_LIGATURE_CHAR_MAP = {
    '\ufb00': 'ff',   # ﬀ  LATIN SMALL LIGATURE FF
    '\ufb01': 'fi',   # ﬁ  LATIN SMALL LIGATURE FI
    '\ufb02': 'fl',   # ﬂ  LATIN SMALL LIGATURE FL
    '\ufb03': 'ffi',  # ﬃ  LATIN SMALL LIGATURE FFI
    '\ufb04': 'ffl',  # ﬄ  LATIN SMALL LIGATURE FFL
    '\ufb05': 'st',   # ﬅ  LATIN SMALL LIGATURE LONG S T
    '\ufb06': 'st',   # ﬆ  LATIN SMALL LIGATURE ST
    '\u0000': '',     # NULL byte — rare but possible in malformed PDFs
}


def clean_text_encoding(text: str) -> str:
    """
    Cleans up common PDF text encoding and ligature extraction errors.

    Step 1 — Apply explicit character map for known Unicode ligature code
              points (ﬁ, ﬂ, ﬀ, ﬃ, ﬄ, ﬅ, ﬆ) that PyMuPDF may not decompose
              when a PDF font has no proper Unicode mapping.
    Step 2 — NFKC normalisation catches any remaining Unicode compatibility
              characters (e.g. ¼ → "1⁄4", ™ stays ™ — ligatures → letters).
    Step 3 — Regex patterns for non-standard font encoding artifacts where a
              ligature glyph was assigned an arbitrary symbol/digit code point.
              These only fire when the suspicious character sits *between* two
              regular letters, so legitimate uses of = or $ are left alone.
    Step 4 — Strip null bytes and ASCII control characters (0x00–0x08,
              0x0B–0x0C, 0x0E–0x1F, 0x7F) that can appear in extracted PDF
              text but are meaningless noise.  Tab, LF, and CR are kept.
    """
    # Step 1: explicit map for known problematic Unicode code points
    for char, replacement in _LIGATURE_CHAR_MAP.items():
        if char in text:
            text = text.replace(char, replacement)

    # Step 2: NFKC normalisation decomposes remaining compatibility ligatures
    text = unicodedata.normalize('NFKC', text)

    # Step 3: fix custom font-encoding artifacts (must be flanked by letters)
    # 'ti' ligature artifacts — e.g. 'introduc3on' / 'introduc$on' → 'introduction'
    text = re.sub(r'(?<=[a-zA-Z])[3$](?=[a-zA-Z])', 'ti', text)
    # 'tt' ligature artifacts — e.g. 'wri=en' → 'written'
    text = re.sub(r'(?<=[a-zA-Z])=(?=[a-zA-Z])', 'tt', text)

    # Step 4: strip null bytes and other ASCII control characters
    # (preserves \t \n \r which are legitimate whitespace in documents)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

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

    # Clean up encoding/ligature errors before processing further
    raw_text = clean_text_encoding(raw_text)

    if not raw_text.strip():
        raise ValueError("empty_text")

    return raw_text, page_count
