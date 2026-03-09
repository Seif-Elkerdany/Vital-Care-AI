import threading

import numpy as np
import torch
from transformers import WhisperForConditionalGeneration, WhisperProcessor

from .config import SAMPLE_RATE


class WhisperEngine:
    def __init__(self, model_id, language):
        self.language = language
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.dtype = torch.float16 if self.device == "cuda" else torch.float32
        self.lock = threading.Lock()

        self.processor = WhisperProcessor.from_pretrained(model_id)
        self.model = WhisperForConditionalGeneration.from_pretrained(
            model_id,
            torch_dtype=self.dtype,
        ).to(self.device)
        self.model.eval()
        self.model.config.forced_decoder_ids = None

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

        with self.lock, torch.inference_mode():
            predicted_ids = self.model.generate(
                input_features,
                forced_decoder_ids=forced_decoder_ids,
            )

        return self.processor.batch_decode(
            predicted_ids,
            skip_special_tokens=True,
        )[0].strip()
