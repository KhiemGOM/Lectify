import unittest


class TestAiServiceParsing(unittest.TestCase):
    def test_parse_sections_nonrepeatable(self):
        from ai_service import parse_sections

        text = "abc\n<<QUESTION>>hello<</QUESTION>>\ndef"
        self.assertEqual(parse_sections(text, "QUESTION", repeatable=False), "hello")

    def test_parse_sections_repeatable_with_bang_prefix(self):
        from ai_service import parse_sections

        text = (
            "<<!TOPIC>>alpha<</!TOPIC>>\n"
            "middle\n"
            "<<!TOPIC>>beta<</!TOPIC>>\n"
        )
        self.assertEqual(parse_sections(text, "TOPIC", repeatable=True), ["alpha", "beta"])

    def test_parse_sections_missing_returns_none_or_empty(self):
        from ai_service import parse_sections

        self.assertIsNone(parse_sections("no sections here", "QUESTION", repeatable=False))
        self.assertEqual(parse_sections("no sections here", "TOPIC", repeatable=True), [])

    def test_parse_metadata_flattens_single_and_keeps_multi(self):
        from ai_service import parse_metadata

        block = (
            '<<FILENAME:"deck.pdf">>\n'
            "<<CHUNKBEGIN:1>>\n"
            "<<CHUNKEND:3>>\n"
            "<<TAG:one>>\n"
            "<<TAG:two>>\n"
        )
        md = parse_metadata(block)
        self.assertEqual(md["FILENAME"], "deck.pdf")
        self.assertEqual(md["CHUNKBEGIN"], "1")
        self.assertEqual(md["CHUNKEND"], "3")
        self.assertEqual(md["TAG"], ["one", "two"])


class TestAiServicePromptBuilding(unittest.TestCase):
    def test_build_chunk_request_contains_filename_and_slides(self):
        from ai_service import build_chunk_request

        req = build_chunk_request("SLIDE 1: Hello", "deck.pdf")
        self.assertIn('FILENAME:"deck.pdf"', req)
        self.assertIn("SLIDES:", req)
        self.assertIn("SLIDE 1: Hello", req)

    def test_build_quiz_prompt_requires_topics_tokens(self):
        from ai_service import build_quiz_prompt

        prompt = build_quiz_prompt("chunk here", "Theory", "MCQ")
        # The model is instructed to output parsable topic blocks.
        self.assertIn("<<!TOPIC>>", prompt)
        self.assertIn("<</!TOPIC>>", prompt)


class TestAiServiceGrading(unittest.TestCase):
    def test_grade_quiz_mcq(self):
        from ai_service import grade_quiz

        raw = "<<ANSWER>>2<</ANSWER>>"
        self.assertEqual(grade_quiz(raw, user_answer="2", question_type="MCQ"), 10)
        self.assertEqual(grade_quiz(raw, user_answer="1", question_type="MCQ"), 0)

    def test_grade_quiz_nonmcq_uses_model_score(self):
        import ai_service as svc

        # Patch the OpenAI call path so the test is offline and deterministic.
        old_get_client = svc.get_openai_client
        old_call_model = svc.call_openai_model
        try:
            svc.get_openai_client = lambda api_key=None: object()
            svc.call_openai_model = (
                lambda client, prompt, model_name, **kwargs: "x\n<<SCORE>>7<</SCORE>>\n"
            )

            raw = (
                "<<QUESTION>>\nWhat is X?\n<</QUESTION>>\n"
                "<<ANSWER>>\nX is Y\n<</ANSWER>>\n"
            )
            score = svc.grade_quiz(raw, user_answer="my answer", question_type="TEXT")
            self.assertEqual(score, 7)
        finally:
            svc.get_openai_client = old_get_client
            svc.call_openai_model = old_call_model


if __name__ == "__main__":
    unittest.main()

