import threading

import numpy as np

from .config import SAMPLE_RATE


class WhisperEngine:
    def __init__(self, model_id, language):
        self.language = language
        self.lock = threading.Lock()
        self._torch = self._load_torch()
        self.device = "cuda" if self._torch.cuda.is_available() else "cpu"
        self.dtype = self._torch.float16 if self.device == "cuda" else self._torch.float32

        processor_class, model_class = self._load_whisper_classes()
        self.processor = processor_class.from_pretrained(model_id)
        self.model = model_class.from_pretrained(model_id, torch_dtype=self.dtype).to(self.device)
        self.model.eval()
        self.model.config.forced_decoder_ids = None

    def _load_torch(self):
        try:
            import torch
        except Exception as exc:
            raise RuntimeError(
                "Whisper transcription requires the `torch` package. Install STT dependencies first."
            ) from exc
        return torch

    def _load_whisper_classes(self):
        try:
            from transformers import WhisperForConditionalGeneration, WhisperProcessor
        except Exception as exc:
            raise RuntimeError(
                "Whisper transcription requires the `transformers` package. Install STT dependencies first."
            ) from exc

        return WhisperProcessor, WhisperForConditionalGeneration

    def transcribe(self, audio_int16):
        audio_f32 = audio_int16.astype(np.float32) / 32768.0
        inputs = self.processor(
            audio_f32,
            sampling_rate=SAMPLE_RATE,
            return_tensors="pt",
        )
        input_features = inputs.input_features.to(self.device, dtype=self.dtype)

        forced_decoder_ids = None
        if self.language:
            forced_decoder_ids = self.processor.get_decoder_prompt_ids(
                language=self.language,
                task="transcribe",
            )

        with self.lock, self._torch.inference_mode():
            predicted_ids = self.model.generate(
                input_features,
                forced_decoder_ids=forced_decoder_ids,
            )

        return self.processor.batch_decode(
            predicted_ids,
            skip_special_tokens=True,
        )[0].strip()
