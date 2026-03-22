import io

import numpy as np
import soundfile as sf

from .contracts import WavEncoder


class SoundFileWavEncoder(WavEncoder):
    def encode(self, audio: np.ndarray, sample_rate: int) -> bytes:
        buffer = io.BytesIO()
        sf.write(buffer, audio, sample_rate, format="WAV")
        buffer.seek(0)
        return buffer.read()
