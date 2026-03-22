import unittest
from queue import Queue

import numpy as np

from tts.config import TTSConfig
from tts.contracts import AudioChunk
from tts.service import TTSService


class FakeSynthesizer:
    def __init__(self, chunks=None, error: str | None = None):
        self.chunks = chunks or []
        self.error = error
        self.calls = 0

    def iter_chunks(self, text: str):
        del text
        self.calls += 1
        if self.error:
            raise RuntimeError(self.error)
        yield from self.chunks


class FakeWavEncoder:
    def __init__(self):
        self.calls: list[tuple[np.ndarray, int]] = []

    def encode(self, audio: np.ndarray, sample_rate: int) -> bytes:
        self.calls.append((audio.copy(), sample_rate))
        return f"encoded:{sample_rate}:{audio.shape}:{audio.dtype}".encode()


class TTSServiceTests(unittest.TestCase):
    def test_synthesize_bytes_merges_chunks_and_encodes_once(self):
        synthesizer = FakeSynthesizer(
            [
                AudioChunk(meta={"index": 1}, audio=np.array([1.0, 2.0], dtype=np.float32)),
                AudioChunk(meta={"index": 2}, audio=np.array([3.0, 4.0], dtype=np.float32)),
            ]
        )
        encoder = FakeWavEncoder()
        service = TTSService(
            synthesizer=synthesizer,
            config=TTSConfig(sample_rate=16000),
            wav_encoder=encoder,
        )

        result = service.synthesize_bytes("hello")

        self.assertEqual(result, b"encoded:16000:(4,):float32")
        self.assertEqual(synthesizer.calls, 1)
        self.assertEqual(len(encoder.calls), 1)
        encoded_audio, sample_rate = encoder.calls[0]
        self.assertEqual(sample_rate, 16000)
        np.testing.assert_array_equal(encoded_audio, np.array([1.0, 2.0, 3.0, 4.0], dtype=np.float32))

    def test_synthesize_wave_chunks_encodes_each_non_empty_chunk(self):
        synthesizer = FakeSynthesizer(
            [
                AudioChunk(meta={"id": "a"}, audio=np.array([1, 2], dtype=np.int16)),
                AudioChunk(meta={"id": "b"}, audio=np.array([], dtype=np.float32)),
                AudioChunk(meta={"id": "c"}, audio=np.array([3, 4], dtype=np.int16)),
            ]
        )
        encoder = FakeWavEncoder()
        service = TTSService(
            synthesizer=synthesizer,
            config=TTSConfig(sample_rate=24000),
            wav_encoder=encoder,
        )

        result = list(service.synthesize_wave_chunks("chunk me"))

        self.assertEqual(result, [
            ({"id": "a"}, b"encoded:24000:(2,):int16"),
            ({"id": "c"}, b"encoded:24000:(2,):int16"),
        ])
        self.assertEqual(len(encoder.calls), 2)

    def test_synthesize_bytes_rejects_blank_text(self):
        service = TTSService(synthesizer=FakeSynthesizer([]), wav_encoder=FakeWavEncoder())

        with self.assertRaisesRegex(ValueError, "text must be non-empty"):
            service.synthesize_bytes("   ")

    def test_stream_to_queue_publishes_error_and_sentinel(self):
        service = TTSService(
            synthesizer=FakeSynthesizer(error="boom"),
            wav_encoder=FakeWavEncoder(),
        )
        out_queue = Queue()

        service.stream_to_queue("hello", out_queue)

        self.assertEqual(out_queue.get(), ("__error__", "RuntimeError('boom')"))
        self.assertIsNone(out_queue.get())


if __name__ == "__main__":
    unittest.main()
