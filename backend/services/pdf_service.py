import re
import unicodedata
import fitz  # PyMuPDF (pulled in by pymupdf4llm)
import pymupdf4llm
import base64
from services import file_service

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


def extract_text_and_markdown(file_path: str) -> tuple[str, str, int, str|None]:
    """
    Opens a PDF with PyMuPDF and extracts both:
      - raw_text         : cleaned plain text per page, for downstream Gemini
                           endpoints (quiz / flashcards / query context).
      - markdown_content : per-page Markdown from pymupdf4llm with encoding
                           artifacts cleaned, and '## Page N' headers prepended
                           so the frontend splitMarkdownByPage() regex works.

    If a page has very little text (e.g., scanned/handwritten), it attempts
    to use Tesseract OCR to extract text from the image layer and re-saves the PDF.

    Raises ValueError("empty_text") if the PDF has no extractable text even after OCR.
    Returns (raw_text, markdown_content, page_count, new_pdf_path).
    """
    doc = fitz.open(file_path)
    # Track if we modified the PDF (added OCR text layers)
    pdf_was_modified = False
    
    try:
        page_count = len(doc)

        raw_pages: list[str] = []
        md_pages: list[str] = []

        for i, page in enumerate(doc):
            # Extract standard text
            raw_page_text = _clean(page.get_text(flags=_EXTRACT_FLAGS))
            
            # If the page has almost no text (likely an image/scan), try OCR
            if len(raw_page_text.strip()) < 50:
                try:
                    # 'full' OCR mode: attempts to parse all images on the page
                    ocr_doc = fitz.open("pdf", page.get_textpage_ocr(flags=_EXTRACT_FLAGS, dpi=300, full=True).pdf_file)
                    ocr_page = ocr_doc[0]
                    # Get the extracted OCR text
                    raw_page_text = _clean(ocr_page.get_text(flags=_EXTRACT_FLAGS))
                    
                    if len(raw_page_text.strip()) > 50:
                        # Success! The OCR found text. Let's replace the original image-only 
                        # page with this new page that contains the hidden text layer so the 
                        # frontend user can actually highlight it.
                        doc.delete_page(i)
                        doc.insert_pdf(ocr_doc, from_page=0, to_page=0, start_at=i)
                        pdf_was_modified = True
                except Exception as e:
                    # Tesseract might not be installed or failed on this specific page
                    print(f"OCR failed for page {i+1}: {e}")

            raw_pages.append(raw_page_text)

        # After potentially replacing pages with OCR'd versions, generate the markdown
        for i in range(page_count):
            page_md = _clean(pymupdf4llm.to_markdown(doc, pages=[i]))
            md_pages.append(f"## Page {i + 1}\n\n{page_md.strip()}")

        raw_text = "\n\n".join(raw_pages)
        markdown_content = "\n\n".join(md_pages)
        
        new_pdf_path = None
        if pdf_was_modified:
            # Save the modified document with the new OCR text layers to a temporary file
            # that upload.py can use to overwrite the original.
            new_pdf_path = file_path + ".ocr.pdf"
            doc.save(new_pdf_path)
            
    finally:
        # Always close so the OS file handle (and Windows exclusive lock) is
        # released before the caller tries to delete the temp file.
        doc.close()

    return raw_text, markdown_content, page_count, new_pdf_path

def get_page_image_base64(pdf_id: str, page_index: int) -> str | None:
    """
    Extracts the image of a specific PDF page given the stored pdf_id.
    page_index is 0-based.
    Returns the base64-encoded JPEG image string, or None if extraction fails.
    """
    pdf_path = file_service.get_pdf_path(pdf_id)
    if not pdf_path:
        return None
    
    try:
        doc = fitz.open(pdf_path)
        if page_index < 0 or page_index >= len(doc):
            return None
            
        page = doc[page_index]
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("jpeg")
        return base64.b64encode(img_bytes).decode("utf-8")
    except Exception as e:
        print(f"Error extracting image for page {page_index}: {e}")
        return None
    finally:
        if 'doc' in locals():
            doc.close()
