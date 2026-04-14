import os

from .prompts import CLINICAL_DECISION_SUPPORT_PROMPT

SYSTEM_PROMPT = CLINICAL_DECISION_SUPPORT_PROMPT


def _get_client():
    try:
        from openai import OpenAI
    except Exception as exc:
        raise RuntimeError(
            "LLM guidance requires the `openai` package. Install backend LLM dependencies first."
        ) from exc

    return OpenAI(
        api_key=os.environ.get("ARC_API_KEY"),
        base_url="https://llm-api.arc.vt.edu/api/v1",
    )


def get_next_action(transcript: str) -> str:
    """
    Main entry point for the LLM guidance module.

    Takes a short plain-text description of the patient's current clinical state
    and returns structured guideline-based guidance for the clinical team.

    Args:
        transcript: Short patient state description from the STT pipeline.

    Returns:
        Structured clinical guidance string for display or TTS.
    """

    client = _get_client()
    response = client.chat.completions.create(
        model="gpt-oss-120b",
        max_tokens=400,
        temperature=0.1,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": f"Patient state:\n{transcript}"}
        ]
    )

    message = response.choices[0].message
    guidance = (message.content or getattr(message, "reasoning", None) or "Please clarify patient status.").strip()

    bad_phrases = ["as an ai", "i cannot", "i'm not able", "i don't know"]
    if any(phrase in guidance.lower() for phrase in bad_phrases):
        return "Unable to generate guidance. Please assess patient manually."

    return guidance
