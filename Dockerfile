FROM node:22-bookworm-slim AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.13-slim-bookworm AS dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libssl-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY requirements.lock ./
RUN python -m pip install --no-cache-dir --prefix=/install -r requirements.lock

FROM python:3.13-slim-bookworm AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    REHEARSAL_PUBLIC=1 \
    REHEARSAL_STATE_DIR=/data/rehearsal \
    PORT=8080
RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu libgomp1 libatomic1 libssl3 libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 rehearsal \
    && useradd --uid 10001 --gid rehearsal --no-create-home rehearsal
WORKDIR /app
COPY --from=dependencies /install /usr/local
COPY server/ ./server/
COPY --from=web /build/web/dist ./web/dist
COPY scripts/container-entrypoint.sh /usr/local/bin/rehearsal-entrypoint
RUN chmod 755 /usr/local/bin/rehearsal-entrypoint
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8080') + '/api/health', timeout=8).read()"
ENTRYPOINT ["rehearsal-entrypoint"]
CMD ["python", "-m", "server.serve"]
