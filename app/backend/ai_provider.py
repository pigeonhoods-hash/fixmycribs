"""Independent AI adapter for FixMyCribs.

Set OPENAI_API_KEY for optional AI features. No Emergent account is required.
The existing non-AI reminder fallback is preserved.
"""
import asyncio
import os
import requests

async def completion(system: str, prompt: str, *, timeout: int = 60) -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    def request():
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            }, timeout=timeout,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"] or ""
    return await asyncio.to_thread(request)
