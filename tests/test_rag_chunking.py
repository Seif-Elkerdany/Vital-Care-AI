import unittest

from backend_api.RAG.chunking import chunk_pages, chunk_text
from backend_api.RAG.pdf_loader import PDFPage, _normalize_page_text


class RagChunkingTests(unittest.TestCase):
    def test_normalize_page_text_strips_furniture_and_dehyphenates(self):
        raw_text = """
        Pediatric Critical Care Medicine
        Volume 21 Number 2
        A. RECOGNITION AND MANAGEMENT OF INFECTION
        Start antimicro-
        bials as soon as possible.

        Measure blood lactate in the initial evaluation.

        Copyright 2020 Wolters Kluwer Health, Inc. All rights reserved.
        www.pccmjournal.org
        8
        """

        normalized, section_label = _normalize_page_text(raw_text)

        self.assertEqual(section_label, "A. RECOGNITION AND MANAGEMENT OF INFECTION")
        self.assertIn("Start antimicrobials as soon as possible.", normalized)
        self.assertIn("Measure blood lactate in the initial evaluation.", normalized)
        self.assertNotIn("Pediatric Critical Care Medicine", normalized)
        self.assertNotIn("Volume 21 Number 2", normalized)
        self.assertNotIn("www.pccmjournal.org", normalized)

    def test_chunk_text_keeps_sentence_boundaries_and_overlap(self):
        text = (
            "Measure lactate early. "
            "Start antibiotics within 1 hour. "
            "Reassess perfusion frequently."
        )

        chunks = chunk_text(text, chunk_size=65, chunk_overlap=30)

        self.assertEqual(
            chunks,
            [
                "Measure lactate early. Start antibiotics within 1 hour.",
                "Start antibiotics within 1 hour. Reassess perfusion frequently.",
            ],
        )

    def test_chunk_pages_preserves_page_and_section_metadata(self):
        pages = [
            PDFPage(
                page_number=23,
                text=(
                    "Use blood lactate as part of the initial evaluation. "
                    "Start antimicrobials as soon as possible."
                ),
                section_label="A. RECOGNITION AND MANAGEMENT OF INFECTION",
            )
        ]

        chunks = chunk_pages(pages, chunk_size=70, chunk_overlap=25)

        self.assertGreaterEqual(len(chunks), 2)
        self.assertTrue(all(chunk.page_number == 23 for chunk in chunks))
        self.assertTrue(
            all(
                chunk.section_label == "A. RECOGNITION AND MANAGEMENT OF INFECTION"
                for chunk in chunks
            )
        )


if __name__ == "__main__":
    unittest.main()
