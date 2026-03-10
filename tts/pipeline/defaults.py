from pipeline.contracts import LanguageModelProvider, SpeechToTextProvider


class NotImplementedSpeechToText(SpeechToTextProvider):
    def transcribe(self, audio_bytes: bytes) -> str:
        raise NotImplementedError("STT provider is not configured yet.")


class PassThroughLanguageModel(LanguageModelProvider):
    def generate(self, prompt: str) -> str:
        return prompt
