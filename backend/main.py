import os
import io
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

# ── Paths (absolute, never relative) ──────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent   # c:\Autonomous AI Agent
BACKEND_DIR = Path(__file__).resolve().parent            # c:\Autonomous AI Agent\backend
FRONTEND_DIR = PROJECT_ROOT / "frontend"

# Load API key from backend/.env
load_dotenv(BACKEND_DIR / ".env")

api_key = os.getenv("OPENAI_API_KEY", "").strip()
client = OpenAI(api_key=api_key) if api_key else None

# ── FastAPI App ───────────────────────────────────────────────
app = FastAPI(
    title="LeadPilot AI",
    description="Autonomous AI Sales Voice Agent",
    version="1.0.0",
)

# CORS — expose custom headers so the frontend JS can read them
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-AI-Response",
        "X-Customer-Text",
        "X-Session-ID",
    ],
)

# ── System Prompt ─────────────────────────────────────────────
SYSTEM_PROMPT = """\
You are Alex, a professional AI sales representative working for LeadPilot.

LeadPilot provides sales automation and customer communication software
to businesses.

Your responsibilities:
1. Greet customers politely.
2. Understand their business requirements.
3. Explain LeadPilot's features.
4. Ask relevant sales qualification questions.
5. Never invent prices or product features.
6. Keep responses simple, friendly and conversational.
7. Guide interested customers towards booking a demo.

You are honest, helpful and professional.
Keep responses concise — ideally 2-4 sentences for voice conversations.
"""

# ── In-memory conversation storage ────────────────────────────
conversations: dict[str, list[dict]] = {}

MODEL_NAME = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

_local_whisper = None


def local_ai_reply(message: str) -> str:
    """Provide useful LeadPilot answers when the OpenAI service is unavailable."""
    text = message.lower()
    if any(word in text for word in ("hello", "hi", "hey")):
        return "Hello! I'm Alex from LeadPilot. I can help you learn about our sales automation and booking a demo."
    if any(word in text for word in ("what does", "features", "what is", "leadpilot", "do")):
        return "LeadPilot helps businesses automate sales communication, manage leads, and qualify prospects so teams can spend more time on conversations that matter."
    if any(word in text for word in ("demo", "meeting", "book", "schedule")):
        return "I'd be happy to help you arrange a demo. Please share your company name and preferred date, and the LeadPilot team can coordinate the next step."
    if any(word in text for word in ("price", "pricing", "cost")):
        return "I don't have verified current pricing information. A LeadPilot demo is the best way to discuss plans and pricing for your business."
    if any(word in text for word in ("automate", "automation", "sales")):
        return "LeadPilot can help automate lead follow-up and sales communication. Tell me how many leads you handle and whether you need email, chat, or voice workflows."
    return "Thanks for telling me about your needs. LeadPilot automates sales communication and helps teams qualify leads and book demos. What would you like to automate in your sales process?"


# ── Helpers ───────────────────────────────────────────────────
def get_ai_reply(history: list[dict]) -> str:
    """Call OpenAI and return the assistant text, with a fallback."""
    if client is None:
        return local_ai_reply(history[-1]["content"] if history else "")

    try:
        response = client.responses.create(
            model=MODEL_NAME,
            instructions=SYSTEM_PROMPT,
            input=history[-20:],
        )
        if getattr(response, "output_text", "").strip():
            return response.output_text.strip()
        raise RuntimeError("OpenAI returned an empty response")
    except Exception as exc:
        print(f"[OpenAI error] {exc}")
        return local_ai_reply(history[-1]["content"] if history else "")


def get_speech_bytes(text: str) -> bytes | None:
    """Convert text to speech via OpenAI TTS. Returns MP3 bytes or None."""
    if client is None:
        return None
    try:
        speech = client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice="coral",
            input=text,
            instructions="Speak in a warm, professional, friendly sales tone.",
        )
        return speech.content
    except Exception as exc:
        print(f"[TTS error] {exc}")
        return None


def transcribe_audio_bytes(filename: str, data: bytes, content_type: str) -> str:
    """Transcribe audio bytes via OpenAI. Returns text or fallback."""
    if client is not None:
        try:
            result = client.audio.transcriptions.create(
                model="gpt-4o-mini-transcribe",
                file=(filename, data, content_type),
            )
            return result.text.strip() if result.text else ""
        except Exception as exc:
            print(f"[STT error] {exc}")

    # Local fallback for offline transcriptions.
    try:
        from faster_whisper import WhisperModel

        global _local_whisper
        if _local_whisper is None:
            _local_whisper = WhisperModel("tiny", device="cpu", compute_type="int8")

        suffix = Path(filename).suffix or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp:
            temp.write(data)
            temp_path = temp.name

        try:
            segments, _ = _local_whisper.transcribe(temp_path, beam_size=5)
            return " ".join(segment.text.strip() for segment in segments).strip()
        finally:
            Path(temp_path).unlink(missing_ok=True)
    except Exception as exc:
        print(f"[Local STT error] {exc}")
        return ""


def safe_header(value: str, max_len: int = 500) -> str:
    """Sanitise a string for use in an HTTP header."""
    return value.replace("\n", " ").replace("\r", "")[:max_len]


# ── Request model ─────────────────────────────────────────────
class ChatRequest(BaseModel):
    session_id: str
    message: str


# ── Routes ────────────────────────────────────────────────────

# 1. Health / welcome
@app.get("/")
def home():
    return {
        "message": "Welcome to LeadPilot AI!",
        "status": "Backend is running successfully",
        "endpoints": {
            "app":        "GET  /app",
            "chat":       "POST /chat",
            "history":    "GET  /chat/{session_id}/history",
            "sessions":   "GET  /sessions",
            "reset":      "DELETE /chat/{session_id}",
            "transcribe": "POST /voice/transcribe",
            "speak":      "POST /voice/speak",
            "pipeline":   "POST /voice/pipeline",
        },
    }


# 2. Text chat with memory
@app.post("/chat")
def chat(request: ChatRequest):
    sid = request.session_id.strip()
    msg = request.message.strip()

    if not sid:
        raise HTTPException(400, "Session ID cannot be empty")
    if not msg:
        raise HTTPException(400, "Message cannot be empty")

    history = conversations.get(sid, []).copy()
    history.append({"role": "user", "content": msg})

    ai_reply = get_ai_reply(history)

    history.append({"role": "assistant", "content": ai_reply})
    conversations[sid] = history[-20:]

    return {
        "session_id": sid,
        "customer_message": msg,
        "ai_response": ai_reply,
        "memory_messages": len(conversations[sid]),
    }


# 3. Conversation history
@app.get("/chat/{session_id}/history")
def get_history(session_id: str):
    history = conversations.get(session_id, [])
    return {
        "session_id": session_id,
        "messages": history,
        "total_messages": len(history),
    }


# 4. Active sessions
@app.get("/sessions")
def list_sessions():
    return {
        "active_sessions": list(conversations.keys()),
        "total": len(conversations),
    }


# 5. Reset / delete a session
@app.delete("/chat/{session_id}")
def reset_chat(session_id: str):
    if session_id not in conversations:
        raise HTTPException(404, "Conversation not found")
    del conversations[session_id]
    return {"message": "Conversation memory cleared", "session_id": session_id}


# 6. Voice → Text (transcription only)
@app.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...)):
    audio_data = await file.read()
    if not audio_data:
        raise HTTPException(400, "Audio file is empty")

    text = transcribe_audio_bytes(
        file.filename or "recording.webm",
        audio_data,
        file.content_type or "audio/webm",
    )

    if not text:
        raise HTTPException(500, "Transcription failed — could not recognise speech")

    return {"filename": file.filename, "transcribed_text": text}


# 7. Text → Speech (TTS only, does NOT create a new chat turn)
@app.post("/voice/speak")
async def voice_speak(request: ChatRequest):
    text = request.message.strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty")

    audio_bytes = get_speech_bytes(text)
    if audio_bytes is None:
        raise HTTPException(500, "Text-to-speech conversion failed")

    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "inline; filename=response.mp3",
            "X-AI-Response": safe_header(text),
        },
    )


# 8. Full voice pipeline: Audio in → Transcribe → Chat AI → TTS out
@app.post("/voice/pipeline")
async def voice_pipeline(
    file: UploadFile = File(...),
    session_id: str = Form("default"),
):
    session_id = session_id.strip()
    if not session_id:
        raise HTTPException(400, "Session ID cannot be empty")

    # Step 1 — Transcribe
    audio_data = await file.read()
    if not audio_data:
        raise HTTPException(400, "Audio file is empty")

    customer_text = transcribe_audio_bytes(
        file.filename or "recording.webm",
        audio_data,
        file.content_type or "audio/webm",
    )
    if not customer_text:
        raise HTTPException(500, "Could not transcribe audio")

    # Step 2 — AI reply
    history = conversations.get(session_id, []).copy()
    history.append({"role": "user", "content": customer_text})

    ai_reply = get_ai_reply(history)

    history.append({"role": "assistant", "content": ai_reply})
    conversations[session_id] = history[-20:]

    # Step 3 — TTS
    speech_bytes = get_speech_bytes(ai_reply)
    if speech_bytes is None:
        # Return JSON with the text instead of failing silently
        return JSONResponse(
            content={
                "customer_text": customer_text,
                "ai_response": ai_reply,
                "error": "TTS unavailable — returning text only",
            },
            headers={
                "X-Customer-Text": safe_header(customer_text),
                "X-AI-Response": safe_header(ai_reply),
                "X-Session-ID": session_id,
            },
        )

    return StreamingResponse(
        io.BytesIO(speech_bytes),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "inline; filename=response.mp3",
            "X-Customer-Text": safe_header(customer_text),
            "X-AI-Response": safe_header(ai_reply),
            "X-Session-ID": session_id,
        },
    )


# ── Serve frontend ────────────────────────────────────────────
@app.get("/app")
def serve_frontend():
    index = FRONTEND_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(404, f"Frontend not found at {index}")
    return FileResponse(str(index))


# Mount static files LAST so it doesn't shadow API routes
if FRONTEND_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
