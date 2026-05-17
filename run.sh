#!/bin/bash
# Run from repo root: bash run.sh
# Ollama must be running: ollama serve
cd "$(dirname "$0")"
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
