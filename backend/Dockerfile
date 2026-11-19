FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/entrypoint.sh ./entrypoint.sh
COPY sql ./sql
RUN chmod +x ./entrypoint.sh

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["./entrypoint.sh"]
