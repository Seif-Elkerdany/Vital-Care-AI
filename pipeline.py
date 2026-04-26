"""Legacy compatibility wrapper for the canonical LLM pipeline."""

from backend_api.LLM.pipeline import LLMRAGPipeline, OpenAICompatClient, PipelineResult

__all__ = ["LLMRAGPipeline", "OpenAICompatClient", "PipelineResult"]
