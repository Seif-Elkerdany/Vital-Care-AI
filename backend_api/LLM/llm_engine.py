from __future__ import annotations

from typing import Optional

from .prompts import CLINICAL_DECISION_SUPPORT_PROMPT

SYSTEM_PROMPT = CLINICAL_DECISION_SUPPORT_PROMPT


class LLMEngine:
    def __init__(
        self,
        model: str,
        base_url: str,
        api_key: Optional[str],
        system_prompt: str = SYSTEM_PROMPT,
    ):
        self.model = model
        self.base_url = base_url
        self.api_key = api_key or "EMPTY"
        self.system_prompt = system_prompt
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from openai import OpenAI
            except Exception as exc:
                raise RuntimeError(
                    "LLM integration requires the `openai` package. Install it with pip."
                ) from exc

            self._client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
            )
        return self._client

    def generate(self, transcript: str) -> str:
        cleaned = transcript.strip()
        if not cleaned:
            return "No speech was recognized."

        client = self._get_client()
        response = client.chat.completions.create(
            model=self.model,
            max_tokens=400,
            temperature=0.1,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": cleaned},
            ],
        )

        message = response.choices[0].message
        content = message.content
        if isinstance(content, str):
            text = content.strip()
        elif isinstance(content, list):
            fragments: list[str] = []
            for part in content:
                if isinstance(part, dict):
                    fragments.append(str(part.get("text", "")))
                    continue
                value = getattr(part, "text", "")
                if value:
                    fragments.append(str(value))
            text = "".join(fragments).strip()
        else:
            text = ""

        return text or "LLM returned an empty response."
