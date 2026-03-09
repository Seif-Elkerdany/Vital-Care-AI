# llm_guidance/guidance.py
from openai import OpenAI
import os

# VT ARC OpenAI-compatible API
# Get your API key from: https://llm.arc.vt.edu → Profile > Settings > Account > API Keys
client = OpenAI(
    api_key=os.environ.get("ARC_API_KEY"),
    base_url="https://llm-api.arc.vt.edu/api/v1"
)

# System prompt redesigned to output structured clinical guidance, not a one-liner.
# Based on Phoenix Sepsis Criteria (2024) and pediatric septic shock guidelines.

# CLINICAL REVIEW NEEDED — validate all thresholds and steps with Carilion.
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

    # Send transcript to ARC-hosted model and get a response
    response = client.chat.completions.create(
        model="gpt-oss-120b",
        max_tokens=400,        # increased — we need room for full stepwise guidance now
        temperature=0.1,       # low = deterministic, safer for medical context
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": f"Patient state:\n{transcript}"}
        ]
    )

    # Extract the text response
    message = response.choices[0].message
    guidance = (message.content or getattr(message, "reasoning", None) or "Please clarify patient status.").strip()

    # Safety filter: if the model refuses or breaks character, return a safe fallback
    bad_phrases = ["as an ai", "i cannot", "i'm not able", "i don't know"]
    if any(phrase in guidance.lower() for phrase in bad_phrases):
        return "Unable to generate guidance. Please assess patient manually."

    return guidance


# Runs only when this file is executed directly for quick manual testing
if __name__ == "__main__":
    transcript = """
    6-year-old male, 20 kilos. Febrile at 39.8, HR 158, BP 88 over 52, sats 91% on room air.
    Lactate came back 4.2. Blood cultures drawn times two. Ceftriaxone is running.
    BP not responding to fluid bolus. Starting norepinephrine now.
    """

    result = get_next_action(transcript)
    print(result)