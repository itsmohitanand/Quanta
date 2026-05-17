import httpx
import json
from typing import AsyncIterator

OLLAMA_URL = "http://localhost:11434"
MODEL = "gemma4"


async def chat_with_tools(messages: list[dict], tools: list[dict]) -> dict:
    """Single non-streaming call with tool support. Returns the full response dict."""
    payload = {"model": MODEL, "messages": messages, "tools": tools, "stream": False}
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()


async def chat_once(messages: list[dict]) -> str:
    payload = {"model": MODEL, "messages": messages, "stream": False}
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()["message"]["content"]


async def stream_chat(messages: list[dict]) -> AsyncIterator[str]:
    payload = {"model": MODEL, "messages": messages, "stream": True}
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                data = json.loads(line)
                if chunk := data.get("message", {}).get("content"):
                    yield chunk
                if data.get("done"):
                    break
