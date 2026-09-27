import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from groq import AsyncGroq
from pydantic import BaseModel, Field

from ..config import settings
from ..db import User
from .auth import current_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/voice", tags=["voice"])
MAX_AUDIO_BYTES = 10 * 1024 * 1024


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


def _client() -> AsyncGroq:
    if not settings.groq_api_key:
        raise HTTPException(503, "Voice requires GROQ_API_KEY")
    return AsyncGroq(api_key=settings.groq_api_key)


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), _: User = Depends(current_user)):
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio too large")
    if not data:
        raise HTTPException(422, "Audio is empty")
    try:
        result = await _client().audio.transcriptions.create(
            file=(audio.filename or "answer.webm", data), model=settings.stt_model
        )
    except Exception:
        log.exception("transcription failed")
        raise HTTPException(502, "Transcription failed")
    return {"text": result.text}


@router.post("/speak")
async def speak(body: SpeakIn, _: User = Depends(current_user)):
    """Text-to-speech. The frontend falls back to browser speech whenever this fails."""
    try:
        resp = await _client().audio.speech.create(
            model=settings.tts_model, voice=settings.tts_voice, input=body.text, response_format="wav"
        )
        audio = await resp.read()
    except Exception as exc:
        detail = str(exc)
        # Groq's voice models are gated behind a one-off terms acceptance per organisation.
        # That is not a bug to debug on every request, so report it plainly and move on.
        if "terms" in detail.lower():
            log.warning(
                "Text-to-speech is unavailable: the model %s needs terms acceptance at "
                "https://console.groq.com/playground?model=%s — the UI is using browser speech instead.",
                settings.tts_model, settings.tts_model,
            )
            raise HTTPException(
                503,
                f"Server voice is not enabled: an org admin must accept the terms for "
                f"{settings.tts_model} in the Groq console. Browser speech is being used instead.",
            )
        log.exception("tts failed")
        raise HTTPException(502, "Speech synthesis unavailable")
    return Response(content=audio, media_type="audio/wav")
