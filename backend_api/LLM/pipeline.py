from __future__ import annotations

from dataclasses import dataclass
import re
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

    _RAW_RETRIEVAL_LIMIT = 8
    _PHRASE_BOOSTS = {
        "antibiotic": 0.08,
        "antibiotics": 0.08,
        "antimicrobial": 0.08,
        "antimicrobials": 0.08,
        "lactate": 0.1,
        "blood lactate": 0.12,
        "suspected septic shock": 0.14,
        "septic shock": 0.08,
        "probable sepsis": 0.1,
        "without shock": 0.08,
        "no shock": 0.08,
        "molecular testing": 0.14,
        "pathogen detection": 0.12,
        "routine": 0.02,
        "1 hour": 0.08,
        "within 1 hour": 0.1,
        "within 1 hr": 0.1,
        "3 hours": 0.08,
        "within 3 hours": 0.1,
        "within 3 hr": 0.1,
    }
    _PHRASE_EXPANSIONS = {
        "antibiotic": ("antibiotics", "antimicrobial", "antimicrobials"),
        "antibiotics": ("antibiotic", "antimicrobial", "antimicrobials"),
        "antimicrobial": ("antibiotic", "antibiotics", "antimicrobials"),
        "antimicrobials": ("antibiotic", "antibiotics", "antimicrobial"),
        "1 hour": ("within 1 hour", "within 1 hr"),
        "within 1 hour": ("1 hour", "within 1 hr"),
        "within 1 hr": ("1 hour", "within 1 hour"),
        "3 hours": ("within 3 hours", "within 3 hr"),
        "within 3 hours": ("3 hours", "within 3 hr"),
        "within 3 hr": ("3 hours", "within 3 hours"),
    }
    _STOPWORDS = {
        "a",
        "about",
        "according",
        "an",
        "and",
        "are",
        "child",
        "do",
        "first",
        "for",
        "guideline",
        "guidelines",
        "have",
        "in",
        "is",
        "it",
        "of",
        "on",
        "regarding",
        "should",
        "the",
        "to",
        "we",
        "what",
        "with",
    }

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
        retrievals, rag_error = self._retrieve(
            structured_query=structured_query,
            original_question=cleaned,
        )
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

        try:
            query = self.llm_client.generate(
                prompt,
                system_instruction=self._query_instruction,
                temperature=0.0,
                max_output_tokens=512,
            )
        except Exception:
            return user_text.strip()

        query = " ".join(query.strip().splitlines()).strip()
        return query or user_text.strip()

    def _retrieve(
        self,
        *,
        structured_query: str,
        original_question: str,
    ) -> tuple[list[dict[str, Any]], Optional[str]]:
        if self.rag_service is None:
            return [], None

        errors: list[str] = []
        candidate_map: dict[str, dict[str, Any]] = {}
        candidates_by_source: dict[str, list[dict[str, Any]]] = {
            "structured": [],
            "original": [],
        }
        retrieval_queries: list[tuple[str, str]] = []

        normalized_structured = structured_query.strip()
        normalized_original = original_question.strip()

        if normalized_structured:
            retrieval_queries.append(("structured", normalized_structured))
        if normalized_original and normalized_original.lower() != normalized_structured.lower():
            retrieval_queries.append(("original", normalized_original))

        raw_limit = max(self._RAW_RETRIEVAL_LIMIT, (self.top_k or 5) * 2)

        for query_source, query_text in retrieval_queries:
            try:
                hits = self.rag_service.search(query_text, top_k=raw_limit)
            except Exception as exc:  # pragma: no cover - external dependency
                errors.append(f"{query_source} retrieval failed: {exc}")
                continue

            for hit in hits:
                candidate = self._annotate_hit(
                    hit=hit,
                    query_source=query_source,
                    original_question=normalized_original,
                    structured_query=normalized_structured,
                )
                candidates_by_source.setdefault(query_source, []).append(candidate)
                chunk_id = str(candidate.get("metadata", {}).get("chunk_id") or candidate.get("id"))
                existing = candidate_map.get(chunk_id)
                if existing is None:
                    candidate_map[chunk_id] = candidate
                    continue

                merged_sources = sorted(
                    set(existing.get("metadata", {}).get("query_sources", []))
                    | set(candidate.get("metadata", {}).get("query_sources", []))
                )
                if float(candidate.get("score", 0.0)) > float(existing.get("score", 0.0)):
                    selected = dict(candidate)
                else:
                    selected = dict(existing)
                selected_metadata = dict(selected.get("metadata", {}) or {})
                selected_metadata["query_sources"] = merged_sources
                selected["metadata"] = selected_metadata
                candidate_map[chunk_id] = selected

        if not candidate_map:
            return [], "; ".join(errors) if errors else None

        ranked_candidates = sorted(
            candidate_map.values(),
            key=lambda item: float(item.get("score", 0.0)),
            reverse=True,
        )
        combined_windows = self._merge_candidate_windows(
            ranked_candidates,
            limit=self.top_k or 5,
        )
        structured_windows = self._merge_candidate_windows(
            sorted(
                candidates_by_source.get("structured", []),
                key=lambda item: float(item.get("score", 0.0)),
                reverse=True,
            ),
            limit=self.top_k or 5,
        )
        original_windows = self._merge_candidate_windows(
            sorted(
                candidates_by_source.get("original", []),
                key=lambda item: float(item.get("score", 0.0)),
                reverse=True,
            ),
            limit=self.top_k or 5,
        )
        evidence_windows = self._select_evidence_windows(
            structured_query=normalized_structured,
            original_question=normalized_original,
            combined_windows=combined_windows,
            structured_windows=structured_windows,
            original_windows=original_windows,
        )
        return evidence_windows, "; ".join(errors) if errors else None

    def _annotate_hit(
        self,
        *,
        hit: dict[str, Any],
        query_source: str,
        original_question: str,
        structured_query: str,
    ) -> dict[str, Any]:
        text = str(hit.get("text", "")).replace("\n", " ").strip()
        metadata = dict(hit.get("metadata", {}) or {})
        raw_score = float(hit.get("score") or 0.0)
        rerank_score = self._rerank_score(
            text=text,
            metadata=metadata,
            raw_score=raw_score,
            query_source=query_source,
            original_question=original_question,
            structured_query=structured_query,
        )
        metadata["raw_score"] = raw_score
        metadata["query_source"] = query_source
        metadata["query_sources"] = [query_source]
        return {
            "id": hit.get("id"),
            "score": rerank_score,
            "text": text,
            "metadata": metadata,
        }

    def _rerank_score(
        self,
        *,
        text: str,
        metadata: dict[str, Any],
        raw_score: float,
        query_source: str,
        original_question: str,
        structured_query: str,
    ) -> float:
        normalized_text = self._normalize_for_match(text)
        normalized_section = self._normalize_for_match(str(metadata.get("section_label", "")))
        searchable_text = f"{normalized_section} {normalized_text}".strip()

        score = raw_score
        for phrase, boost in self._selected_phrase_boosts(original_question, structured_query):
            if phrase in searchable_text:
                score += boost

        overlap = len(
            self._meaningful_tokens(original_question + " " + structured_query)
            & self._meaningful_tokens(searchable_text)
        )
        score += min(overlap, 10) * 0.01

        if query_source == "original":
            score += 0.01

        if any(keyword in normalized_text for keyword in ("recommend", "suggest", "should", "measure", "administer", "start")):
            score += 0.03

        if any(
            keyword in searchable_text
            for keyword in (
                "recognition and management of infection",
                "antimicrobial therapy",
            )
        ):
            score += 0.02

        if (
            "figure 2" in normalized_text
            and "quick guide" in normalized_text
            and not any(
                keyword in normalized_text
                for keyword in ("measure", "administer", "antimicrobial", "lactate", "molecular", "1 hour", "3 hour")
            )
        ):
            score -= 0.12

        return round(score, 6)

    def _select_evidence_windows(
        self,
        *,
        structured_query: str,
        original_question: str,
        combined_windows: list[dict[str, Any]],
        structured_windows: list[dict[str, Any]],
        original_windows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not structured_query or self._is_generic_query(structured_query):
            selected_windows = original_windows or combined_windows or structured_windows
            return self._order_evidence_windows(
                selected_windows,
                original_question=original_question,
                structured_query=structured_query,
            )

        combined_quality = self._retrieval_quality(
            combined_windows,
            original_question=original_question,
            structured_query=structured_query,
        )
        structured_quality = self._retrieval_quality(
            structured_windows,
            original_question=original_question,
            structured_query=structured_query,
        )
        original_quality = self._retrieval_quality(
            original_windows,
            original_question=original_question,
            structured_query=structured_query,
        )

        if structured_quality < 0.22 and original_quality > structured_quality + 0.03:
            selected_windows = original_windows or combined_windows or structured_windows
            return self._order_evidence_windows(
                selected_windows,
                original_question=original_question,
                structured_query=structured_query,
            )

        if combined_quality >= max(structured_quality, original_quality):
            selected_windows = combined_windows or structured_windows or original_windows
            return self._order_evidence_windows(
                selected_windows,
                original_question=original_question,
                structured_query=structured_query,
            )

        if original_quality > structured_quality:
            selected_windows = original_windows or combined_windows or structured_windows
            return self._order_evidence_windows(
                selected_windows,
                original_question=original_question,
                structured_query=structured_query,
            )

        selected_windows = structured_windows or combined_windows or original_windows
        return self._order_evidence_windows(
            selected_windows,
            original_question=original_question,
            structured_query=structured_query,
        )

    def _merge_candidate_windows(
        self,
        ranked_candidates: list[dict[str, Any]],
        *,
        limit: int,
    ) -> list[dict[str, Any]]:
        candidate_pool = ranked_candidates[: max(self._RAW_RETRIEVAL_LIMIT, limit * 3)]
        candidate_lookup = {
            (
                int(item.get("metadata", {}).get("page_number") or 0),
                int(item.get("metadata", {}).get("chunk_index_in_page") or 0),
            ): item
            for item in candidate_pool
        }
        consumed_keys: set[tuple[int, int]] = set()
        clusters: list[list[dict[str, Any]]] = []

        for candidate in ranked_candidates:
            page_number = int(candidate.get("metadata", {}).get("page_number") or 0)
            chunk_index = int(candidate.get("metadata", {}).get("chunk_index_in_page") or 0)
            candidate_key = (page_number, chunk_index)
            if candidate_key in consumed_keys:
                continue

            cluster = [candidate]
            consumed_keys.add(candidate_key)

            next_key = (page_number, chunk_index + 1)
            neighbor = candidate_lookup.get(next_key)
            if neighbor is not None and next_key not in consumed_keys:
                merged_preview = self._append_fragment(
                    str(candidate.get("text", "")),
                    str(neighbor.get("text", "")),
                )
                if (
                    self._should_merge_forward(candidate, neighbor)
                    and len(merged_preview) <= 900
                ):
                    cluster.append(neighbor)
                    consumed_keys.add(next_key)

            clusters.append(cluster)

        ranked_windows: list[dict[str, Any]] = []
        for cluster in clusters:
            ordered_cluster = sorted(
                cluster,
                key=lambda item: int(item.get("metadata", {}).get("chunk_index_in_page") or 0),
            )
            merged_text = ""
            for item in ordered_cluster:
                merged_text = self._append_fragment(merged_text, str(item.get("text", "")))

            base_metadata = dict(ordered_cluster[0].get("metadata", {}) or {})
            merged_ids = [
                str(item.get("metadata", {}).get("chunk_id") or item.get("id"))
                for item in ordered_cluster
            ]
            merged_indexes = [
                int(item.get("metadata", {}).get("chunk_index_in_page") or 0)
                for item in ordered_cluster
            ]
            query_sources = sorted(
                {
                    str(source)
                    for item in ordered_cluster
                    for source in item.get("metadata", {}).get("query_sources", [])
                    if source
                }
            )
            window_score = max(float(item.get("score", 0.0)) for item in ordered_cluster) + (len(ordered_cluster) - 1) * 0.02
            base_metadata["merged_chunk_ids"] = merged_ids
            base_metadata["merged_chunk_indexes"] = merged_indexes
            base_metadata["query_sources"] = query_sources
            ranked_windows.append(
                {
                    "id": merged_ids[0] if len(merged_ids) == 1 else "|".join(merged_ids),
                    "score": round(window_score, 6),
                    "text": merged_text.strip(),
                    "metadata": base_metadata,
                }
            )

        ranked_windows.sort(key=lambda item: float(item.get("score", 0.0)), reverse=True)
        return ranked_windows[:limit]

    @classmethod
    def _should_merge_forward(
        cls,
        current_item: dict[str, Any],
        next_item: dict[str, Any],
    ) -> bool:
        current_meta = current_item.get("metadata", {}) or {}
        next_meta = next_item.get("metadata", {}) or {}
        if current_meta.get("page_number") != next_meta.get("page_number"):
            return False
        if int(next_meta.get("chunk_index_in_page") or 0) != int(
            current_meta.get("chunk_index_in_page") or 0
        ) + 1:
            return False

        current_section = str(current_meta.get("section_label") or "").strip()
        next_section = str(next_meta.get("section_label") or "").strip()
        if current_section and next_section and current_section != next_section:
            return False

        current_tokens = cls._meaningful_tokens(str(current_item.get("text", "")))
        next_tokens = cls._meaningful_tokens(str(next_item.get("text", "")))
        return len(current_tokens & next_tokens) >= 6

    @classmethod
    def _normalize_for_match(cls, text: str) -> str:
        normalized = text.lower().replace("\n", " ")
        normalized = normalized.replace("hours", "hour").replace("hrs", "hr")
        normalized = re.sub(r"[^a-z0-9./ ]+", " ", normalized)
        return " ".join(normalized.split())

    @classmethod
    def _meaningful_tokens(cls, text: str) -> set[str]:
        tokens = set(re.findall(r"[a-z0-9]+", cls._normalize_for_match(text)))
        return {token for token in tokens if len(token) > 2 and token not in cls._STOPWORDS}

    @classmethod
    def _selected_phrase_boosts(
        cls,
        original_question: str,
        structured_query: str,
    ) -> list[tuple[str, float]]:
        combined_query = cls._normalize_for_match(f"{original_question} {structured_query}")
        selected: list[tuple[str, float]] = []
        seen_phrases: set[str] = set()
        for phrase, boost in cls._PHRASE_BOOSTS.items():
            if phrase in combined_query:
                if phrase not in seen_phrases:
                    selected.append((phrase, boost))
                    seen_phrases.add(phrase)
                for expanded_phrase in cls._PHRASE_EXPANSIONS.get(phrase, ()):
                    if expanded_phrase in seen_phrases:
                        continue
                    selected.append(
                        (
                            expanded_phrase,
                            min(boost, cls._PHRASE_BOOSTS.get(expanded_phrase, boost)),
                        )
                    )
                    seen_phrases.add(expanded_phrase)
        return selected

    @classmethod
    def _is_generic_query(cls, query: str) -> bool:
        tokens = cls._meaningful_tokens(query)
        generic_phrases = {
            "guideline",
            "guidelines",
            "management",
            "pediatric",
            "recommendation",
            "recommendations",
            "sepsis",
            "shock",
            "treatment",
        }
        if len(tokens) <= 2:
            return True
        return len(tokens - generic_phrases) <= 2

    @classmethod
    def _retrieval_quality(
        cls,
        windows: list[dict[str, Any]],
        *,
        original_question: str,
        structured_query: str,
    ) -> float:
        if not windows:
            return 0.0

        top_window = windows[0]
        metadata = top_window.get("metadata", {}) or {}
        searchable_text = cls._normalize_for_match(
            f"{metadata.get('section_label', '')} {top_window.get('text', '')}"
        )
        quality = min(float(top_window.get("score", 0.0)), 1.0) * 0.1
        quality += min(
            len(cls._meaningful_tokens(original_question) & cls._meaningful_tokens(searchable_text)),
            6,
        ) * 0.03
        quality += min(
            len(cls._selected_phrase_boosts(original_question, structured_query)),
            4,
        ) * 0.04
        if any(
            keyword in searchable_text
            for keyword in ("measure", "administer", "start", "obtain", "recommend", "suggest")
        ):
            quality += 0.08
        if "figure 2" in searchable_text and "quick guide" in searchable_text:
            quality -= 0.05
        return round(max(quality, 0.0), 6)

    @classmethod
    def _order_evidence_windows(
        cls,
        windows: list[dict[str, Any]],
        *,
        original_question: str,
        structured_query: str,
    ) -> list[dict[str, Any]]:
        if len(windows) < 2:
            return windows

        remaining = list(windows)
        ordered: list[dict[str, Any]] = []
        covered_phrases: set[str] = set()

        while remaining:
            best_item = max(
                remaining,
                key=lambda item: cls._window_priority(
                    item,
                    original_question=original_question,
                    structured_query=structured_query,
                    covered_phrases=covered_phrases,
                ),
            )
            ordered.append(best_item)
            covered_phrases.update(
                cls._matched_query_phrases(
                    best_item,
                    original_question=original_question,
                    structured_query=structured_query,
                )
            )
            remaining.remove(best_item)

        return ordered

    @classmethod
    def _window_priority(
        cls,
        item: dict[str, Any],
        *,
        original_question: str,
        structured_query: str,
        covered_phrases: set[str],
    ) -> float:
        searchable_text = cls._normalize_for_match(
            f"{item.get('metadata', {}).get('section_label', '')} {item.get('text', '')}"
        )
        matched_phrases = cls._matched_query_phrases(
            item,
            original_question=original_question,
            structured_query=structured_query,
        )
        new_phrases = [phrase for phrase in matched_phrases if phrase not in covered_phrases]
        priority = float(item.get("score", 0.0))
        priority += len(new_phrases) * 0.05
        priority += len(matched_phrases) * 0.01
        if any(
            keyword in searchable_text
            for keyword in ("measure", "administer", "start", "obtain", "recommend", "suggest")
        ):
            priority += 0.02
        return round(priority, 6)

    @classmethod
    def _matched_query_phrases(
        cls,
        item: dict[str, Any],
        *,
        original_question: str,
        structured_query: str,
    ) -> list[str]:
        searchable_text = cls._normalize_for_match(
            f"{item.get('metadata', {}).get('section_label', '')} {item.get('text', '')}"
        )
        return [
            phrase
            for phrase, _ in cls._selected_phrase_boosts(original_question, structured_query)
            if phrase in searchable_text
        ]

    @staticmethod
    def _append_fragment(existing: str, fragment: str) -> str:
        fragment = fragment.strip()
        if not existing:
            return fragment
        if not fragment or fragment in existing:
            return existing

        existing_words = existing.split()
        fragment_words = fragment.split()
        max_overlap = min(40, len(existing_words), len(fragment_words))

        for overlap_size in range(max_overlap, 6, -1):
            if existing_words[-overlap_size:] == fragment_words[:overlap_size]:
                merged_words = existing_words + fragment_words[overlap_size:]
                return " ".join(merged_words).strip()

        return f"{existing} {fragment}".strip()

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
            section_label = str(meta.get("section_label") or "").strip()
            label = f"{source} p.{page}" if page is not None else source
            if section_label:
                label = f"{label} [{section_label}]"
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
