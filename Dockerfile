# ---------- build stage ----------
FROM python:3.11-slim AS builder

WORKDIR /build

RUN pip install --no-cache-dir uv

COPY site_api/requirements.txt ./
RUN uv pip install --no-cache --system --prefix=/install -r requirements.txt

# ---------- runtime stage ----------
FROM python:3.11-slim

# Non-root user for security
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

# Copy only the installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY site_api/ ./site_api/

# Switch to non-root user
USER app

EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/healthz')" || exit 1

CMD ["sh", "-c", "uvicorn site_api.main:app --host 0.0.0.0 --port 8080 --workers ${WEB_CONCURRENCY:-2}"]
