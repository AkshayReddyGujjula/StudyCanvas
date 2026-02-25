
import asyncio
from services.pdf_service import get_page_image_base64
from services.gemini_service import extract_text_from_image_b64
import json

async def test():
    try:
        # User is looking at page index 4 (0-based) for the slides4.pdf based on the screenshot showing page 5/33
        img_raw = get_page_image_base64('Slides4.pdf', 4)
        if not img_raw:
            print('Failed to get page image for Slides4.pdf page index 4')
            return
            
        print('Got image base64, length:', len(img_raw))
        text = await extract_text_from_image_b64(img_raw)
        print('Extracted Text length:', len(text))
        print('Text:', text)
    except Exception as e:
        print('Error:', e)

if __name__ == '__main__':
    asyncio.run(test())

