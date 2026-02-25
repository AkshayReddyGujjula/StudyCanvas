
from dotenv import load_dotenv
load_dotenv()
import asyncio
from services.gemini_service import generate_page_quiz
import json

async def test():
    try:
        res = await generate_page_quiz(
            page_content='',
            pdf_id='42aef00c-47ed-4e7a-8f60-a069eb3e1d8b',
            page_index=4
        )
        print('Result:', res)
    except Exception as e:
        print('Error:', e)

if __name__ == '__main__':
    asyncio.run(test())

