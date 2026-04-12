import copy
import unittest

from backend_api.LLM.pipeline import LLMRAGPipeline
from backend_api.LLM.prompts import PIPELINE_ANSWER_INSTRUCTION, PIPELINE_QUERY_INSTRUCTION


QUESTION_1 = (
    "We have a child with suspected septic shock. According to the guideline, "
    "what should we do first regarding antibiotics and lactate?"
)
QUESTION_2 = (
    "For a child with probable sepsis but no shock, what does the guideline say "
    "about antibiotic timing?"
)
QUESTION_3 = (
    "Should we routinely use molecular testing for pathogen detection in children "
    "with probable sepsis or suspected septic shock?"
)


def make_hit(*, chunk_id, page, chunk_index, text, score, section_label=""):
    return {
        "id": f"point-{chunk_id}",
        "score": score,
        "text": text,
        "metadata": {
            "chunk_id": chunk_id,
            "page_number": page,
            "chunk_index_in_page": chunk_index,
            "document_name": "surviving_sepsis_campaign_international_guidelines.651.pdf",
            "section_label": section_label,
        },
    }


class FakeRAGService:
    def __init__(self, responses):
        self.responses = responses
        self.queries = []

    def search(self, query, top_k=None):
        self.queries.append((query, top_k))
        return copy.deepcopy(self.responses.get(query, []))


class ScriptedLLMClient:
    def __init__(self, *, query_map, answer_handlers):
        self.query_map = query_map
        self.answer_handlers = answer_handlers

    def generate(
        self,
        prompt,
        *,
        system_instruction=None,
        temperature=0.0,
        max_output_tokens=4096,
    ):
        del temperature, max_output_tokens

        user_message = prompt.split("User message:\n", 1)[1]
        user_message = user_message.split("\n\nRetrieved guideline context:", 1)[0]
        user_message = user_message.split("\n\nTask:", 1)[0].strip()
        if system_instruction == PIPELINE_QUERY_INSTRUCTION:
            return self.query_map[user_message]
        if system_instruction == PIPELINE_ANSWER_INSTRUCTION:
            return self.answer_handlers[user_message](prompt)
        raise AssertionError(f"Unexpected system instruction: {system_instruction!r}")


class PipelineRetrievalTests(unittest.TestCase):
    def test_retrieve_merges_adjacent_recommendation_chunks_and_preserves_query_sources(self):
        responses = {
            "suspected septic shock antibiotics lactate": [
                make_hit(
                    chunk_id="doc:page4:0",
                    page=4,
                    chunk_index=0,
                    score=0.95,
                    text="Figure 2. Quick guide for probable sepsis or suspected septic shock.",
                    section_label="FIGURE 2",
                ),
                make_hit(
                    chunk_id="doc:page8:0",
                    page=8,
                    chunk_index=0,
                    score=0.84,
                    text="We recommend starting empiric antimicrobial therapy as soon as possible, ideally within 1 hour of recognition for children with suspected septic shock.",
                    section_label="A. RECOGNITION AND MANAGEMENT OF INFECTION",
                ),
                make_hit(
                    chunk_id="doc:page8:1",
                    page=8,
                    chunk_index=1,
                    score=0.83,
                    text="We suggest using blood lactate as part of the initial evaluation and management of children with probable sepsis or suspected septic shock.",
                    section_label="A. RECOGNITION AND MANAGEMENT OF INFECTION",
                ),
            ],
            QUESTION_1: [
                make_hit(
                    chunk_id="doc:page8:0",
                    page=8,
                    chunk_index=0,
                    score=0.82,
                    text="We recommend starting empiric antimicrobial therapy as soon as possible, ideally within 1 hour of recognition for children with suspected septic shock.",
                    section_label="A. RECOGNITION AND MANAGEMENT OF INFECTION",
                ),
                make_hit(
                    chunk_id="doc:page8:1",
                    page=8,
                    chunk_index=1,
                    score=0.81,
                    text="We suggest using blood lactate as part of the initial evaluation and management of children with probable sepsis or suspected septic shock.",
                    section_label="A. RECOGNITION AND MANAGEMENT OF INFECTION",
                ),
            ],
        }
        pipeline = LLMRAGPipeline(
            llm_client=ScriptedLLMClient(query_map={}, answer_handlers={}),
            rag_service=FakeRAGService(responses),
            top_k=5,
        )

        retrievals, rag_error = pipeline._retrieve(
            structured_query="suspected septic shock antibiotics lactate",
            original_question=QUESTION_1,
        )

        self.assertIsNone(rag_error)
        antibiotic_window = next(
            item
            for item in retrievals
            if "within 1 hour" in item["text"]
        )
        lactate_window = next(
            item
            for item in retrievals
            if "blood lactate" in item["text"]
        )

        self.assertEqual(antibiotic_window["metadata"]["page_number"], 8)
        self.assertIn(
            antibiotic_window["metadata"]["merged_chunk_indexes"],
            ([0], [0, 1]),
        )
        self.assertEqual(
            antibiotic_window["metadata"]["query_sources"],
            ["original", "structured"],
        )
        self.assertIn("blood lactate", lactate_window["text"])

    def test_run_falls_back_to_original_question_when_structured_query_is_generic(self):
        query_map = {
            QUESTION_2: "pediatric sepsis guideline recommendations",
        }
        responses = {
            "pediatric sepsis guideline recommendations": [
                make_hit(
                    chunk_id="doc:page4:0",
                    page=4,
                    chunk_index=0,
                    score=0.92,
                    text="Figure 2. Quick guide for probable sepsis or suspected septic shock.",
                    section_label="FIGURE 2",
                ),
            ],
            QUESTION_2: [
                make_hit(
                    chunk_id="doc:page24:0",
                    page=24,
                    chunk_index=0,
                    score=0.79,
                    text="For children with probable sepsis without shock, we suggest a time-limited rapid investigation and, if concern for sepsis is substantiated, starting antimicrobials as soon as possible after appropriate evaluation, ideally within 3 hours of recognition.",
                    section_label="A. RECOGNITION AND MANAGEMENT OF INFECTION",
                ),
            ],
        }

        def answer_handler(prompt):
            self.assertIn("p.24", prompt)
            self.assertIn("ideally within 3 hours", prompt)
            return (
                "SUMMARY: The guideline addresses antimicrobial timing for probable sepsis without shock.\n"
                "SUPPORTED_CONCERN: Probable sepsis without shock [1]\n"
                "STEPS:\n"
                "1. Perform a time-limited rapid investigation [1]\n"
                "2. If concern for sepsis is substantiated, start antimicrobials as soon as possible after appropriate evaluation, ideally within 3 hours of recognition [1]"
            )

        pipeline = LLMRAGPipeline(
            llm_client=ScriptedLLMClient(
                query_map=query_map,
                answer_handlers={QUESTION_2: answer_handler},
            ),
            rag_service=FakeRAGService(responses),
            top_k=5,
        )

        result = pipeline.run(QUESTION_2)

        self.assertEqual(result.retrievals[0]["metadata"]["page_number"], 24)
        self.assertIn("within 3 hours", result.final_answer)
        self.assertIn("rapid investigation", result.final_answer)

    def test_run_keeps_supported_insufficient_evidence_answer_for_molecular_testing(self):
        query_map = {
            QUESTION_3: "routine molecular testing pathogen detection probable sepsis suspected septic shock",
        }
        responses = {
            "routine molecular testing pathogen detection probable sepsis suspected septic shock": [
                make_hit(
                    chunk_id="doc:page23:0",
                    page=23,
                    chunk_index=0,
                    score=0.86,
                    text="There is insufficient evidence to issue a recommendation for or against routine molecular testing for pathogen detection or identification in children with probable sepsis or suspected septic shock.",
                    section_label="DIAGNOSTIC TESTING",
                ),
            ],
            QUESTION_3: [
                make_hit(
                    chunk_id="doc:page23:0",
                    page=23,
                    chunk_index=0,
                    score=0.85,
                    text="There is insufficient evidence to issue a recommendation for or against routine molecular testing for pathogen detection or identification in children with probable sepsis or suspected septic shock.",
                    section_label="DIAGNOSTIC TESTING",
                ),
            ],
        }

        def answer_handler(prompt):
            self.assertIn("p.23", prompt)
            self.assertIn("routine molecular testing", prompt)
            return (
                "SUMMARY: The retrieved guideline context addresses routine molecular testing in children with probable sepsis or suspected septic shock.\n"
                "SUPPORTED_CONCERN: Probable sepsis or suspected septic shock [1]\n"
                "STEPS:\n"
                "1. The guideline states there is insufficient evidence to recommend for or against routine molecular testing for pathogen detection or identification [1]"
            )

        pipeline = LLMRAGPipeline(
            llm_client=ScriptedLLMClient(
                query_map=query_map,
                answer_handlers={QUESTION_3: answer_handler},
            ),
            rag_service=FakeRAGService(responses),
            top_k=5,
        )

        result = pipeline.run(QUESTION_3)

        self.assertEqual(result.retrievals[0]["metadata"]["page_number"], 23)
        self.assertIn("insufficient evidence", result.final_answer)
        self.assertIn("routine molecular testing", result.final_answer)


if __name__ == "__main__":
    unittest.main()
