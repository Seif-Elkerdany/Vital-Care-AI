import io

import numpy as np

from .contracts import WavEncoder


class SoundFileWavEncoder(WavEncoder):
    def encode(self, audio: np.ndarray, sample_rate: int) -> bytes:
        try:
            import soundfile as sf
        except Exception as exc:
            raise RuntimeError(
                "WAV encoding requires the `soundfile` package. Install TTS dependencies first."
            ) from exc

        buffer = io.BytesIO()
        sf.write(buffer, audio, sample_rate, format="WAV")
        buffer.seek(0)
        return buffer.read()
