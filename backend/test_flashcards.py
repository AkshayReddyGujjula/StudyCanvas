
import requests

url = 'http://localhost:8000/api/flashcards'
data = {
  'source_type': 'page',
  'struggling_nodes': [],
  'raw_text': 'test',
  'pdf_id': 'real.pdf',
  'page_index': 0,
  'page_content': '',
  'existing_flashcards': ['Test 1?', 'Test 2?']
}
r = requests.post(url, json=data)
print(r.status_code)
print(r.text)

