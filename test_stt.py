
from faster_whisper import WhisperModel

# Load the local speech recognition model
model = WhisperModel(
    "tiny",
    device="cpu",
    compute_type="int8"
)

# Convert audio into text
segments, info = model.transcribe(
    "test_audio.mp3",
    beam_size=5
)

print("Detected Language:", info.language)
print("\nTranscription:")

for segment in segments:
    print(segment.text)
