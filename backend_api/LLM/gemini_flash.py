from __future__ import annotations

import os
from typing import Optional


class GeminiFlashClient:
    """Lightweight wrapper around Google Gemini Flash models using the current `google.genai` SDK."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gemini-2.5-flash",
    ) -> None:
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("Gemini API key is required. Set GEMINI_API_KEY or pass api_key explicitly.")

        self.model_name = model
        try:
            from google import genai  # type: ignore
            from google.genai import types  # type: ignore
        except Exception as exc:  # pragma: no cover - import guard
            raise RuntimeError(
                "Gemini Flash requires the `google-genai` package. Install it with `pip install google-genai`."
            ) from exc

        self._genai = genai
        self._types = types
        self._client = genai.Client(api_key=self.api_key)

    def generate(
        self,
        prompt: str,
        *,
        system_instruction: Optional[str] = None,
        temperature: float = 0.2,
        max_output_tokens: int = 512,
    ) -> str:
        config = self._types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            system_instruction=system_instruction,
        )

        response = self._client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=config,
        )

        text = getattr(response, "text", None) or ""
        return text.strip()
