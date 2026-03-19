import tempfile
import unittest
from pathlib import Path

import numpy as np

from stt.src.stt_app.service import SpeechToTextService


class FakeEngine:
    def __init__(self, text: str):
        self.text = text
        self.calls = 0

    def transcribe(self, audio):
        del audio
        self.calls += 1
        return self.text


class FakeLLM:
    def __init__(self, response: str | None = None, error: str | None = None):
        self.response = response
        self.error = error
        self.calls = 0

    def generate(self, transcript: str) -> str:
        del transcript
        self.calls += 1
        if self.error:
            raise RuntimeError(self.error)
        return self.response or ""


class FakeTTS:
    def __init__(self, audio: bytes = b"WAV", error: str | None = None):
        self.audio = audio
        self.error = error
        self.calls = 0

    def synthesize(self, text: str) -> bytes:
        del text
        self.calls += 1
        if self.error:
            raise RuntimeError(self.error)
        return self.audio


class FakeRecorder:
    def __init__(self, stop_audio):
        self.stop_audio = stop_audio
        self.recording = False
        self.start_calls = 0
        self.stop_calls = 0

    def start(self):
        self.start_calls += 1
        self.recording = True

    def stop(self):
        self.stop_calls += 1
        self.recording = False
        return self.stop_audio


class SpeechToTextServiceTests(unittest.TestCase):
    def test_process_audio_runs_full_pipeline_and_persists_outputs(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            service = SpeechToTextService(
                model_id="unused",
                language="en",
                engine=FakeEngine("  patient is febrile  "),
                llm_engine=FakeLLM("SUMMARY: stable"),
                tts_engine=FakeTTS(b"WAVDATA"),
                tts_output_dir=tmpdir,
            )
            service._convert_wav_to_mp3 = lambda wav_bytes, mp3_path: Path(mp3_path).write_bytes(b"MP3DATA")

            result = service.process_audio(np.array([1, 2, 3], dtype=np.int16))

            self.assertEqual(result.text, "patient is febrile")
            self.assertEqual(result.llm_response, "SUMMARY: stable")
            self.assertTrue(result.tts_generated)
            self.assertIsNotNone(result.tts_wav_path)
            self.assertIsNotNone(result.tts_mp3_path)
            self.assertEqual(Path(result.tts_wav_path).read_bytes(), b"WAVDATA")
            self.assertEqual(Path(result.tts_mp3_path).read_bytes(), b"MP3DATA")

            service._latest_tts_audio = None
            self.assertEqual(service.latest_response_audio(), b"WAVDATA")
            self.assertEqual(service.latest_response_audio_mp3(), b"MP3DATA")
            self.assertEqual(service.latest(), result)
            self.assertEqual(service.list_items(limit=10), [result])

    def test_process_audio_keeps_publishing_when_llm_fails(self):
        tts = FakeTTS()
        service = SpeechToTextService(
            model_id="unused",
            language="en",
            engine=FakeEngine("spoken text"),
            llm_engine=FakeLLM(error="upstream down"),
            tts_engine=tts,
            tts_output_dir=None,
        )

        result = service.process_audio(np.array([1, 2, 3], dtype=np.int16))

        self.assertEqual(result.text, "spoken text")
        self.assertTrue(result.llm_response.startswith("LLM request failed: upstream down"))
        self.assertFalse(result.tts_generated)
        self.assertIsNone(result.tts_error)
        self.assertEqual(tts.calls, 0)

    def test_toggle_recording_processes_audio_and_updates_status(self):
        recorder = FakeRecorder(np.array([1, 2, 3], dtype=np.int16))
        service = SpeechToTextService(
            model_id="unused",
            language="en",
            engine=FakeEngine("hello world"),
            recorder=recorder,
            tts_output_dir=None,
        )
        service._start_transcription = lambda audio: service._transcribe_worker(audio)

        self.assertEqual(service.toggle_recording(), "recording_started")
        self.assertTrue(service.status().recording)
        self.assertEqual(service.toggle_recording(), "transcribing")

        status = service.status()
        self.assertFalse(status.recording)
        self.assertFalse(status.transcribing)
        self.assertEqual(status.last_event, "published")
        self.assertEqual(status.latest_text, "hello world")
        self.assertEqual(recorder.start_calls, 1)
        self.assertEqual(recorder.stop_calls, 1)

    def test_toggle_recording_handles_busy_and_no_audio_states(self):
        service = SpeechToTextService(
            model_id="unused",
            language="en",
            engine=FakeEngine("ignored"),
            recorder=FakeRecorder(None),
            tts_output_dir=None,
        )

        service._busy.set()
        self.assertEqual(service.toggle_recording(), "busy")
        service._busy.clear()

        self.assertEqual(service.toggle_recording(), "recording_started")
        self.assertEqual(service.toggle_recording(), "no_audio")
        self.assertEqual(service.status().last_event, "no_audio")


if __name__ == "__main__":
    unittest.main()
