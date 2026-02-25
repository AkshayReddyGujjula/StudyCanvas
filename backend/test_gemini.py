
import asyncio
from services.gemini_service import generate_flashcards
from services.pdf_service import get_page_image_base64
import json

async def test():
    try:
        res = await generate_flashcards(
            struggling_nodes=[],
            raw_text='test',
            pdf_id='real.pdf', # Assuming a real.pdf is present, or fake it
            source_type='page',
            page_index=0,
            page_content='',
            existing_flashcards=[]
        )
        print(json.dumps(res, indent=2))
    except Exception as e:
        print('Error:', e)

if __name__ == '__main__':
    asyncio.run(test())

