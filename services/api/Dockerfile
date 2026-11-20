# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — dependency builder
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# System build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# CPU-only PyTorch. torch comes in through sentence-transformers, and the
# default PyPI wheel for Linux is the CUDA build, which pulls ~2 GB of NVIDIA
# libraries (cuDNN, NCCL, cuBLAS, triton, ...) that this CPU-only API never
# loads. Installing torch from the CPU index first means requirements.txt
# finds it already satisfied. A venv rather than `pip install --prefix`: a
# second --prefix install can't see the first one's torch and would fetch the
# CUDA build again.
ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

# Fail the build if anything GPU-related got in after all.
RUN python -c "import torch, sys; sys.exit(f'CUDA build of torch: {torch.__version__}' if torch.version.cuda else 0)" \
 && ! pip list --format=freeze | grep -iE '^(nvidia-|cuda-|triton=)'

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Non-root user for security
RUN groupadd --gid 1001 appgroup \
 && useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

WORKDIR /app

# Runtime system deps (libpq for asyncpg/psycopg2 at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the pre-built virtualenv from the builder (same python:3.12-slim
# base, so its interpreter symlinks resolve here too).
ENV VIRTUAL_ENV=/opt/venv
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application source
COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 8000

# Health check (hits the liveness probe)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Uvicorn with:
#   --workers 1       → single process (use replica scaling in K8s/ECS)
#   --loop uvloop     → faster event loop (installed via uvicorn[standard])
#   --proxy-headers   → trust X-Forwarded-* from reverse proxy / load balancer
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--loop", "uvloop", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
