# Deployable LiteLLM proxy for FocusSpace.
# Build context = this `litellm/` folder. Honors $PORT (Railway/Render/Fly).
FROM ghcr.io/berriai/litellm:main-latest

COPY config.yaml /app/config.yaml

# Shell form so ${PORT} expands at runtime (defaults to 4000 locally).
ENTRYPOINT []
CMD litellm --config /app/config.yaml --host 0.0.0.0 --port ${PORT:-4000}
