from __future__ import annotations

class EmbeddingModel:
    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        try:
            from sentence_transformers import SentenceTransformer
        except Exception as exc:
            raise RuntimeError(
                "Embeddings require the `sentence-transformers` package. Install RAG dependencies first."
            ) from exc

        try:
            self._model = SentenceTransformer(model_name)
        except ValueError as exc:
            if "model type" in str(exc) and "Transformers does not recognize" in str(exc):
                raise ValueError(
                    "Failed to load the configured embedding model "
                    f"`{model_name}` because the installed `transformers` package "
                    "does not support that architecture yet. Use a stable "
                    "SentenceTransformers checkpoint such as "
                    "`sentence-transformers/all-MiniLM-L6-v2`, or upgrade "
                    "`transformers` and `sentence-transformers` together."
                ) from exc
            raise

    @property
    def dimension(self) -> int:
        return int(self._model.get_sentence_embedding_dimension())

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = self._model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vectors.tolist()

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]
