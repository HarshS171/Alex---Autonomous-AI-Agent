# 🚀 LeadPilot AI — Autonomous AI Sales Voice Agent

An intelligent, voice-enabled AI sales agent powered by OpenAI. LeadPilot's agent **Alex** can chat with customers via text or voice, understand their needs, explain product features, and guide them towards booking a demo.

---

## ✨ Features

| Feature | Description |
|---|---|
| **AI Sales Chat** | Conversational AI agent (Alex) with session memory |
| **Voice Input** | Record your voice → automatic speech-to-text transcription |
| **Voice Output** | AI responses spoken aloud with natural-sounding TTS |
| **Full Voice Pipeline** | Speak → AI processes → Hear the reply (end-to-end) |
| **Session Management** | Multiple conversations with independent memory |
| **Modern UI** | Dark-themed, responsive frontend with chat + voice modes |

---

## 📁 Project Structure

```
Autonomous AI Agent/
├── backend/
│   ├── main.py          # FastAPI server (all API endpoints)
│   └── .env             # API keys (not committed)
├── frontend/
│   ├── index.html       # Main UI page
│   ├── style.css        # Styling
│   └── app.js           # Frontend logic
├── test_stt.py          # Local speech-to-text test script
├── requirements.txt     # Python dependencies
├── .gitignore
└── README.md
```

---

## 🛠️ Setup

### 1. Prerequisites
- Python 3.10+
- An [OpenAI API key](https://platform.openai.com/api-keys)

### 2. Install Dependencies

```bash
# Create virtual environment (if not already done)
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install packages
pip install -r requirements.txt
```

### 3. Configure Environment

Create `backend/.env` for OpenAI-powered chat, STT, and TTS:

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4.1-mini
```

The application also starts without an API key or usable API credits. It uses
built-in LeadPilot answers for chat and `faster-whisper` for offline audio
transcription. Browser speech synthesis provides a text-to-speech fallback.

### 4. Run the Server

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Open the App

Navigate to: **http://localhost:8000/app**

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check / welcome |
| `POST` | `/chat` | Text chat with Alex (JSON body: `session_id`, `message`) |
| `GET` | `/chat/{session_id}/history` | Get conversation history |
| `GET` | `/sessions` | List active sessions |
| `DELETE` | `/chat/{session_id}` | Clear a conversation |
| `POST` | `/voice/transcribe` | Upload audio → get text |
| `POST` | `/voice/speak` | Send text → get AI reply as audio |
| `POST` | `/voice/pipeline` | Upload audio → AI processes → returns audio reply |

---

## 🎤 How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Customer     │────▶│  LeadPilot   │────▶│   OpenAI     │
│  (Voice/Text) │◀────│  Backend     │◀────│   APIs       │
└──────────────┘     └──────────────┘     └──────────────┘
                           │
                     ┌─────┴─────┐
                     │ Services  │
                     ├───────────┤
                     │ STT       │  gpt-4o-mini-transcribe
                     │ Chat      │  gpt-4.1-mini
                     │ TTS       │  gpt-4o-mini-tts
                     └───────────┘
```

1. **Text mode**: Customer types → Alex (AI) responds with text
2. **Voice mode**: Customer speaks → audio transcribed → Alex responds → response spoken aloud
3. **Full pipeline**: Single endpoint handles the entire voice-in → voice-out flow

---

## 🧪 Testing

### Test Local STT (faster-whisper)

```bash
python test_stt.py
```

### Test API with curl

```bash
# Text chat
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test-1", "message": "What does LeadPilot do?"}'

# Voice transcription
curl -X POST http://localhost:8000/voice/transcribe \
  -F "file=@test_audio.mp3"
```

---

## 📄 License

This project is for educational and demonstration purposes.
