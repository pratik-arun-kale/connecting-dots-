from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CHROMA_DIR = BASE_DIR / ".chromadb"
COLLECTION_NAME = "advanced_rag_collection"

CHUNK_SIZE = 250
CHUNK_OVERLAP = 50

BM25_TOP_K = 10
VECTOR_TOP_K = 10
FUSED_TOP_K = 20
RERANK_TOP_K = 5

RRF_K = 60
MAX_RETRIEVAL_ATTEMPTS = 2

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# ── Ollama generative answer settings ─────────────────────────────────────────
# To switch models, change OLLAMA_MODEL. Supported lightweight options:
#   "qwen2.5:3b"    (preferred — fast, good instruction following)
#   "gemma3:4b"     (Google, strong reasoning)
#   "phi4-mini"     (Microsoft, very compact)
#   "llama3.2:3b"   (Meta, well-rounded)
# Pull a model with: ollama pull <model_name>
OLLAMA_MODEL = "qwen2.5:3b"
OLLAMA_API_URL = "http://localhost:11434"
OLLAMA_TEMPERATURE = 0.1    # Low temperature keeps answers factual and grounded
OLLAMA_MAX_TOKENS = 512     # Max tokens in the generated answer
OLLAMA_TIMEOUT_SEC = 60     # Seconds before aborting a slow generation call
OLLAMA_CONTEXT_CHUNKS = 5   # How many top reranked chunks to include in the prompt
