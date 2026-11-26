// ===== LeadPilot AI — Frontend Application =====

const API_BASE = window.location.origin;
let sessionId = generateSessionId();
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];

// ===== Initialize =====
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("sessionId").textContent = sessionId.slice(0, 8);
    setupEventListeners();
    checkBackendHealth();
});

function generateSessionId() {
    return "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// Check backend is reachable
async function checkBackendHealth() {
    const badge = document.getElementById("connectionStatus");
    try {
        const res = await fetch(`${API_BASE}/`, { method: "GET" });
        if (res.ok) {
            badge.innerHTML = `<span class="badge-dot"></span> Connected`;
            badge.style.borderColor = "rgba(0,206,201,0.2)";
            badge.style.color = "var(--success)";
        } else {
            throw new Error("bad status");
        }
    } catch {
        badge.innerHTML = `<span class="badge-dot" style="background:var(--danger)"></span> Disconnected`;
        badge.style.borderColor = "rgba(255,107,107,0.2)";
        badge.style.color = "var(--danger)";
    }
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Navigation
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    // Chat input
    const chatInput = document.getElementById("chatInput");
    const btnSend = document.getElementById("btnSend");

    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    chatInput.addEventListener("input", () => {
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
        btnSend.disabled = !chatInput.value.trim();
    });

    btnSend.addEventListener("click", sendMessage);
    btnSend.disabled = true;

    // New session
    document.getElementById("btnNewSession").addEventListener("click", newSession);

    // Voice button
    document.getElementById("btnVoice").addEventListener("click", toggleRecording);
}

// ===== View Switching =====
function switchView(view) {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelector(`[data-view="${view}"]`).classList.add("active");

    document.querySelectorAll(".view-container").forEach(v => v.classList.remove("active"));
    document.getElementById(view + "View").classList.add("active");
}

// ===== Chat Functions =====
async function sendMessage() {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    input.style.height = "auto";
    document.getElementById("btnSend").disabled = true;

    // Hide welcome message
    const welcome = document.querySelector(".welcome-message");
    if (welcome) welcome.remove();

    // Add user message
    addMessage("user", text);

    // Show typing indicator
    const typing = showTyping();

    try {
        const response = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: sessionId,
                message: text
            })
        });

        // Remove typing indicator before processing response
        if (typing.parentNode) typing.remove();

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: "Request failed" }));
            throw new Error(err.detail || "Request failed");
        }

        const data = await response.json();
        addMessage("assistant", data.ai_response, true);

    } catch (error) {
        if (typing.parentNode) typing.remove();
        addMessage("assistant", `Sorry, something went wrong: ${error.message}`);
    }
}

function sendQuickMessage(text) {
    document.getElementById("chatInput").value = text;
    sendMessage();
}

function addMessage(role, content, withTTS = false) {
    const container = document.getElementById("messagesContainer");

    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = role === "user" ? "Y" : "A";

    const contentWrapper = document.createElement("div");

    const msgContent = document.createElement("div");
    msgContent.className = "msg-content";
    msgContent.textContent = content;

    const msgTime = document.createElement("div");
    msgTime.className = "msg-time";
    msgTime.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    contentWrapper.appendChild(msgContent);

    // Add TTS play button for assistant messages
    if (withTTS && role === "assistant") {
        const ttsBtn = document.createElement("button");
        ttsBtn.className = "btn-play-tts";
        ttsBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
            Listen
        `;
        ttsBtn.addEventListener("click", () => playTTS(content, ttsBtn));
        contentWrapper.appendChild(ttsBtn);
    }

    contentWrapper.appendChild(msgTime);

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(contentWrapper);

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function showTyping() {
    const container = document.getElementById("messagesContainer");
    const typing = document.createElement("div");
    typing.className = "message assistant";
    typing.innerHTML = `
        <div class="msg-avatar">A</div>
        <div class="typing-indicator">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>
    `;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
    return typing;
}

// ===== TTS Playback =====
async function playTTS(text, button) {
    const originalHTML = button.innerHTML;
    button.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        Loading...
    `;
    button.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/voice/speak`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: sessionId,
                message: text
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: "TTS failed" }));
            throw new Error(err.detail || "TTS failed");
        }

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);

        // Create inline audio player
        const playerDiv = document.createElement("div");
        playerDiv.className = "audio-player-inline";

        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = audioUrl;
        audio.autoplay = true;

        playerDiv.appendChild(audio);

        button.parentElement.appendChild(playerDiv);
        button.remove();

    } catch (error) {
        button.innerHTML = originalHTML;
        button.disabled = false;
        console.error("TTS error:", error);
        alert("Could not play audio: " + error.message);
    }
}

// ===== Voice Recording =====
async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Pick a supported MIME type
        let mimeType = "audio/webm";
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            mimeType = "audio/webm;codecs=opus";
        }

        mediaRecorder = new MediaRecorder(stream, { mimeType });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(audioChunks, { type: mimeType });
            if (blob.size > 0) {
                await processVoiceInput(blob);
            } else {
                document.getElementById("voiceStatus").textContent =
                    "No audio recorded. Try again.";
            }
        };

        mediaRecorder.start(250); // collect data every 250ms
        isRecording = true;

        document.getElementById("btnVoice").classList.add("recording");
        document.getElementById("voiceVisualizer").classList.add("active");
        document.getElementById("voiceStatus").textContent = "Listening... Click again to stop";

    } catch (error) {
        document.getElementById("voiceStatus").textContent =
            "Microphone access denied. Please allow microphone access in your browser settings.";
        console.error("Mic error:", error);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    isRecording = false;

    document.getElementById("btnVoice").classList.remove("recording");
    document.getElementById("voiceVisualizer").classList.remove("active");
    document.getElementById("voiceStatus").textContent = "Processing your voice...";
}

async function processVoiceInput(audioBlob) {
    const transcript = document.getElementById("voiceTranscript");
    const placeholder = transcript.querySelector(".transcript-placeholder");
    if (placeholder) placeholder.remove();

    try {
        // Send audio to voice pipeline
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");
        formData.append("session_id", sessionId);

        const response = await fetch(`${API_BASE}/voice/pipeline`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: "Voice pipeline failed" }));
            throw new Error(err.detail || "Voice pipeline failed");
        }

        const contentType = response.headers.get("content-type") || "";

        // Get transcribed text from headers
        const customerText = response.headers.get("X-Customer-Text") || "...";
        const aiText = response.headers.get("X-AI-Response") || "...";

        // If response is audio, play it
        if (contentType.includes("audio/")) {
            addTranscriptEntry("you", customerText);
            addTranscriptEntry("alex", aiText);
            const audioResponseBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioResponseBlob);
            const audio = new Audio(audioUrl);
            audio.play().catch(err => console.warn("Autoplay blocked:", err));
        } else {
            // JSON fallback (TTS was unavailable). Add each entry once.
            const data = await response.json();
            if (data.customer_text) {
                addTranscriptEntry("you", data.customer_text);
            }
            if (data.ai_response) {
                addTranscriptEntry("alex", data.ai_response);
                speakInBrowser(data.ai_response);
            }
        }

        document.getElementById("voiceStatus").textContent =
            "Click the microphone to speak again";

    } catch (error) {
        document.getElementById("voiceStatus").textContent =
            `Error: ${error.message}. Try again.`;
        console.error("Voice pipeline error:", error);
    }
}

function addTranscriptEntry(label, text) {
    const transcript = document.getElementById("voiceTranscript");
    const entry = document.createElement("div");
    entry.className = "transcript-entry";
    entry.innerHTML = `
        <div class="label ${label}">${label === "you" ? "You" : "Alex"}</div>
        <div>${escapeHtml(text)}</div>
    `;
    transcript.appendChild(entry);
    transcript.scrollTop = transcript.scrollHeight;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function speakInBrowser(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
}

// ===== Session Management =====
function newSession() {
    const previousSessionId = sessionId;
    fetch(`${API_BASE}/chat/${encodeURIComponent(previousSessionId)}`, {
        method: "DELETE"
    }).catch(() => {});

    // Clear messages
    const container = document.getElementById("messagesContainer");
    container.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">👋</div>
            <h2>Welcome to LeadPilot AI</h2>
            <p>I'm Alex, your AI sales assistant. Ask me anything about LeadPilot's sales automation solutions!</p>
            <div class="quick-actions">
                <button class="quick-btn" onclick="sendQuickMessage('What does LeadPilot do?')">What does LeadPilot do?</button>
                <button class="quick-btn" onclick="sendQuickMessage('I want to automate my sales')">Automate my sales</button>
                <button class="quick-btn" onclick="sendQuickMessage('Can I book a demo?')">Book a demo</button>
            </div>
        </div>
    `;

    // Clear voice transcript
    document.getElementById("voiceTranscript").innerHTML =
        '<div class="transcript-placeholder">Your conversation will appear here</div>';

    // New session ID
    sessionId = generateSessionId();
    document.getElementById("sessionId").textContent = sessionId.slice(0, 8);

    document.getElementById("voiceStatus").textContent =
        "Click the microphone to start speaking";

    // Re-check backend
    checkBackendHealth();
}
