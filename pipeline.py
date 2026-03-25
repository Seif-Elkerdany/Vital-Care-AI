from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional

from rag import RAGService


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

        self._query_instruction = (
            "You turn a short user message into a concise semantic search query. "
            "Return a single line that captures the user's intent; no commentary."
        )
        self._answer_instruction = (
        "You are a clinical decision support assistant for pediatric emergencies. "
        "Answer using the supplied retrieved context first, and only use general knowledge when the context is missing or incomplete. "
        "If the retrieved context is missing or weak, say that no indexed context was available or that the indexed context was limited. "
        "Return a complete response in exactly this format:\n"
        "SUMMARY: 1-2 sentences summarizing the key clinical findings or question.\n"
        "CONDITION: the most likely condition or clinical concern.\n"
        "STEPS:\n"
        "1. first action\n"
        "2. second action\n"
        "3. continue as needed\n\n"
        "Rules:\n"
        "- Be concise but complete.\n"
        "- Do not stop mid-sentence or mid-list.\n"
        "- Do not include markdown formatting like ** or bullet symbols.\n"
        "- Do not add commentary before or after the format.\n"
        "- Use stepwise, actionable clinical guidance.\n"
        "- Cite retrieved snippets inline like [1], [2] when they support a statement.\n"
        "- If context is unavailable, still answer briefly and explicitly mention the missing indexed context."
        )

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

    def _build_structured_query(self, user_text: str) -> str:
        prompt = (
            "User message:\n"
            f"{user_text}\n\n"
            "Return only one tight search query or extracted intent."
        )
        return self.llm_client.generate(
            prompt,
            system_instruction=self._query_instruction,
            temperature=0.15,
            max_output_tokens=64,
        )

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
            "Context snippets:\n"
            f"{context_block or '[none]'}\n\n"
            "Write a concise answer. Cite snippets inline like [1], [2] matching the context order. "
            "If no context is available, answer briefly and mention the missing context."
        )
        return self.llm_client.generate(
            prompt,
            system_instruction=self._answer_instruction,
            temperature=0.35,
            max_output_tokens=512,
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
        temperature: float = 0.2,
        max_output_tokens: int = 512,
    ) -> str:
        _ = temperature, max_output_tokens  # LLMEngine handles its own sampling limits
        combined = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt
        return self.llm_engine.generate(combined)
