import json
import unittest
from main import _extract_hermes_answer, _extract_json_object

SAMPLE_HERMES_OUTPUT = '''Query: Format: {"is_ready": true/false, "summary": "...", "questions": []}

╭─ ☤ Hermes ───────────────────────────────────────────────────────────────────╮
{"is_ready": false, "summary": "Deskripsi terlalu minimal.", "questions": [{"id": "purpose", "question": "Untuk apa?", "placeholder": "testing", "required": true}]}
╰──────────────────────────────────────────────────────────────────────────────╯
Resume this session with:
  hermes --resume abc -p natasha
'''

class ExtractReviewJsonTests(unittest.TestCase):
    def test_extract_answer_from_hermes_panel_and_ignore_echoed_template(self):
        answer = _extract_hermes_answer(SAMPLE_HERMES_OUTPUT)
        data = json.loads(_extract_json_object(answer))
        self.assertFalse(data["is_ready"])
        self.assertEqual(data["summary"], "Deskripsi terlalu minimal.")
        self.assertEqual(len(data["questions"]), 1)

    def test_extract_last_valid_json_when_panel_missing(self):
        text = 'Query: {"is_ready": true/false}\nanswer: {"is_ready": true, "summary": "ok", "questions": []}'
        data = json.loads(_extract_json_object(text))
        self.assertTrue(data["is_ready"])
        self.assertEqual(data["summary"], "ok")

if __name__ == "__main__":
    unittest.main()
