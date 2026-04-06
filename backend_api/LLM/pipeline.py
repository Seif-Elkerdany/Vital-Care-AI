from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional

from backend_api.RAG import RAGService

from .prompts import PIPELINE_ANSWER_INSTRUCTION, PIPELINE_QUERY_INSTRUCTION


@dataclass
class PipelineResult:
    original_input: str
    structured_query: str
    retrievals: list[dict[str, Any]]
    final_answer: str
    rag_error: Optional[str] = None


class LLMRAGPipeline:
    """Runs: user text -> (LLM for query) -> RAG -> (LLM for answer)."""

    def __init__(
        self,
        llm_client,
        rag_service: Optional[RAGService] = None,
        *,
        top_k: Optional[int] = None,
    ) -> None:
        self.llm_client = llm_client
        self.rag_service = rag_service
        self.top_k = top_k

        self._query_instruction = PIPELINE_QUERY_INSTRUCTION
        self._answer_instruction = PIPELINE_ANSWER_INSTRUCTION

    def run(self, user_text: str) -> PipelineResult:
        cleaned = (user_text or "").strip()
        if not cleaned:
            raise ValueError("User text must be non-empty.")

        structured_query = self._build_structured_query(cleaned)
        retrievals, rag_error = self._retrieve(structured_query or cleaned)
        answer = self._build_answer(cleaned, retrievals)

        return PipelineResult(
            original_input=cleaned,
            structured_query=structured_query,
            retrievals=retrievals,
            final_answer=answer,
            rag_error=rag_error,
        )

    def _build_structured_query(self, user_text):
        prompt = (
            "User message:\n"
            f"{user_text.strip()}\n\n"
            "Task:\n"
            "Rewrite the user message as exactly one concise, standalone clinical retrieval query "
            "for pediatric sepsis and septic shock guideline search.\n\n"
            "Rules:\n"
            "- Preserve only explicitly stated patient population, symptoms, signs, vitals, labs, and constraints.\n"
            "- Use retrieval-friendly clinical wording without changing meaning.\n"
            "- Do not add diagnoses, interpretations, treatments, or unstated facts.\n"
            "- Do not answer the question.\n"
            "- Return exactly one single line and nothing else."
        )

        query = self.llm_client.generate(
            prompt,
            system_instruction=self._query_instruction,
            temperature=0.0,
            max_output_tokens=512,
        )

        query = " ".join(query.strip().splitlines()).strip()
        return query

    def _retrieve(self, query: str) -> tuple[list[dict[str, Any]], Optional[str]]:
        if self.rag_service is None:
            return [], None

        try:
            return self.rag_service.search(query, top_k=self.top_k), None
        except Exception as exc:  # pragma: no cover - external dependency
            return [], str(exc)

    def _build_answer(self, user_text: str, retrievals: list[dict[str, Any]]) -> str:
        context_block = self._format_context(retrievals)
        prompt = (
            "User message:\n"
            f"{user_text}\n\n"
            "Retrieved guideline context:\n"
            f"{context_block}\n\n"
            "Task:\n"
            "Answer strictly and only from the retrieved guideline context.\n"
            "Follow the exact response format defined in the system instruction.\n"
            "Every clinical statement must be directly supported by the retrieved snippets.\n"
            "Use inline citations like [1], [2] only when directly supported.\n"
            "If any requested detail is not explicitly supported by the retrieved context, say so in the required format.\n"
            "Do not use outside knowledge. Do not guess. Do not add text before or after the required format."
        )
        return self.llm_client.generate(
            prompt,
            system_instruction=self._answer_instruction,
            temperature=0.0,
            max_output_tokens=4096,
        )

    @staticmethod
    def _format_context(retrievals: list[dict[str, Any]]) -> str:
        lines: List[str] = []
        for idx, item in enumerate(retrievals, start=1):
            text = str(item.get("text", "")).replace("\n", " ").strip()
            meta = item.get("metadata", {}) or {}
            source = meta.get("document_name") or meta.get("title") or "source"
            page = meta.get("page_number")
            label = f"{source} p.{page}" if page is not None else source
            lines.append(f"[{idx}] {label}: {text}")
        return "\n".join(lines)


class OpenAICompatClient:
    """Adapter so the legacy LLMEngine can be plugged into the pipeline.

    The pipeline expects a ``generate(prompt, system_instruction=..., temperature=..., max_output_tokens=...)``
    method; the LLMEngine only exposes ``generate(transcript)`` with a fixed system prompt.
    We prepend any system_instruction to the user prompt to emulate instruction control.
    """

    def __init__(self, llm_engine) -> None:
        self.llm_engine = llm_engine

    def generate(
        self,
        prompt: str,
        *,
        system_instruction: Optional[str] = None,
        temperature: float = 0.0,
        max_output_tokens: int = 4096,
    ) -> str:
        _ = temperature, max_output_tokens  # LLMEngine handles its own sampling limits
        combined = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt
        return self.llm_engine.generate(combined)
