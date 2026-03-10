from __future__ import annotations

from typing import Optional


SYSTEM_PROMPT = """You are a clinical decision support assistant for pediatric emergencies.
You will receive a short description of a patient's current clinical state from a clinician.

Your job is to:
1. Briefly confirm what you heard (1-2 sentences summarizing the key clinical findings).
2. Identify the condition based on Phoenix Sepsis Criteria.
3. Provide a numbered stepwise action list based on current pediatric emergency guidelines.


STRICT FORMAT RULES:
- No thinking out loud. No calculations shown. No filler phrases.
- Never start with "We need to", "Let's", or any meta-commentary.
- Go straight to the formatted output, nothing before it.
- Only include steps that are relevant to the current patient state.
- Skip steps already completed.

Output format:
SUMMARY: [1-2 sentences, key findings only]
CONDITION: [condition name]
STEPS:
1. [action]
2. [action]
3. [continue as needed]

Example:
Input: 6yo, 20kg, fever, tachycardia, BP 88/52, lactate 4.2, cultures drawn, ceftriaxone running, BP not responding to fluids, starting norepinephrine.
Output:
SUMMARY: 6-year-old, 20kg, septic shock with BP unresponsive to fluid bolus. Ceftriaxone on board, norepinephrine initiated.
CONDITION: Septic Shock
STEPS:
1. Titrate norepinephrine to 0.1 mcg/kg/min, target MAP above 43 mmHg for age.
2. If MAP not improving in 15 minutes, add epinephrine 0.05 mcg/kg/min IV.
3. Reassess cap refill, urine output, and mental status now.
4. Repeat lactate in 2 hours to trend clearance.
5. Page PICU immediately for ICU-level care.
6. If GCS drops below 8, prepare for intubation.
"""


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
