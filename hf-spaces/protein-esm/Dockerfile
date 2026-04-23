FROM python:3.11-slim

WORKDIR /code

# Install PyTorch CPU first (large wheel, cache separately)
COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

COPY main.py .

# HF Spaces requires port 7860
EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
