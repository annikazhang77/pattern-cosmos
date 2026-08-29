FROM node:22-alpine AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080
WORKDIR /app
COPY pyproject.toml ./
COPY pattern_agent ./pattern_agent
RUN pip install --no-cache-dir .
COPY web_api.py base_experiences.json agent_detected_patterns.json ./
COPY --from=frontend /app/web/dist ./web/dist
CMD ["sh", "-c", "uvicorn web_api:app --host 0.0.0.0 --port ${PORT}"]
