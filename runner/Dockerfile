FROM node:22-bookworm-slim AS node
FROM python:3.13-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && python -m pip install --no-cache-dir pytest==9.1.1 \
    && groupadd --gid 10001 runner \
    && useradd --uid 10001 --gid runner --no-create-home runner
USER 10001:10001
WORKDIR /work
ENV HOME=/tmp CI=true PYTHONDONTWRITEBYTECODE=1
CMD ["sleep", "600"]
