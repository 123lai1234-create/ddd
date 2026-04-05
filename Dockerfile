FROM python:3.11-slim

WORKDIR /app

COPY site_api/requirements.txt ./site_api/requirements.txt
RUN pip install --no-cache-dir -r site_api/requirements.txt

COPY site_api/ ./site_api/

EXPOSE 8080

CMD ["uvicorn", "site_api.main:app", "--host", "0.0.0.0", "--port", "8080"]
