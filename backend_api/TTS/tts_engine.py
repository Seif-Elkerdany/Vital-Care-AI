from __future__ import annotations

class TTSEngine:
    """Compatibility wrapper used by the STT app.

    The actual synthesis logic lives in ``TTSService`` so the codebase has a
    single TTS implementation to maintain.
    """

    def __init__(self, voice: str, lang_code: str, sample_rate: int):
        self.voice = voice
        self.lang_code = lang_code
        self.sample_rate = sample_rate
        self._service = None

    def _get_service(self):
        if self._service is None:
            from .bootstrap import build_tts_service

            self._service = build_tts_service(
                default_voice=self.voice,
                lang_code=self.lang_code,
                sample_rate=self.sample_rate,
            )
        return self._service

    def synthesize(self, text: str) -> bytes:
        return self._get_service().synthesize_bytes(text)
