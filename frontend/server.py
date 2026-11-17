import os
import requests
from fastapi import Body, FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Stabilization Navigator Intake Desk")

TARGET_AGENT_URL = os.environ.get(
    "AGENT_URL",
    "https://sq7-stabilization-navigator-530357188502.us-central1.run.app"
)

@app.get("/apps/{path:path}")
async def proxy_apps_get(path: str, request: Request):
    url = f"{TARGET_AGENT_URL}/apps/{path}"
    headers = {}
    if "accept" in request.headers:
        headers["Accept"] = request.headers["accept"]
    resp = requests.get(url, headers=headers, timeout=60)
    return Response(content=resp.content, status_code=resp.status_code, media_type=resp.headers.get("content-type"))

@app.post("/apps/{path:path}")
async def proxy_apps(path: str, request: Request):
    url = f"{TARGET_AGENT_URL}/apps/{path}"
    body = await request.body()
    headers = {"Content-Type": request.headers.get("content-type", "application/json")}
    resp = requests.post(url, data=body, headers=headers, timeout=60)
    return Response(content=resp.content, status_code=resp.status_code, media_type=resp.headers.get("content-type"))

@app.post("/run")
async def proxy_run(request: Request):
    url = f"{TARGET_AGENT_URL}/run"
    body = await request.body()
    headers = {"Content-Type": request.headers.get("content-type", "application/json")}
    resp = requests.post(url, data=body, headers=headers, timeout=120)
    return Response(content=resp.content, status_code=resp.status_code, media_type=resp.headers.get("content-type"))

# ---- Google Cloud speech + maps config ---------------------------------
# The service runs as its Cloud Run service account, so Speech-to-Text and
# Text-to-Speech need no keys. The Maps key is browser-side and restricted
# to this site's referrers; it is passed in via the MAPS_API_KEY env var.
from fastapi.responses import JSONResponse

_LANGS = {"en-US", "es-US"}
_VOICES = {"en-US": "en-US-Neural2-F", "es-US": "es-US-Neural2-A"}


@app.get("/config.json")
def client_config():
    return {"mapsApiKey": os.environ.get("MAPS_API_KEY", "")}


@app.post("/stt")
def speech_to_text(request: Request, body: bytes = Body(..., media_type="application/octet-stream"), lang: str = "en-US"):
    from google.cloud import speech

    if lang not in _LANGS:
        lang = "en-US"
    if not body or len(body) > 10_000_000:
        return JSONResponse({"error": "Audio missing or too large"}, status_code=400)
    client = speech.SpeechClient()
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
        sample_rate_hertz=48000,
        language_code=lang,
        alternative_language_codes=["es-US" if lang == "en-US" else "en-US"],
        enable_automatic_punctuation=True,
        model="latest_long",
    )
    resp = client.recognize(config=config, audio=speech.RecognitionAudio(content=body))
    text = " ".join(r.alternatives[0].transcript.strip() for r in resp.results if r.alternatives)
    return {"transcript": text.strip(), "lang": lang}


@app.post("/tts")
async def text_to_speech(request: Request):
    from google.cloud import texttospeech

    data = await request.json()
    text = str(data.get("text", ""))[:1500]
    lang = data.get("lang", "en-US")
    if lang not in _LANGS:
        lang = "en-US"
    if not text.strip():
        return JSONResponse({"error": "No text"}, status_code=400)
    client = texttospeech.TextToSpeechClient()
    audio = client.synthesize_speech(
        input=texttospeech.SynthesisInput(text=text),
        voice=texttospeech.VoiceSelectionParams(language_code=lang, name=_VOICES[lang]),
        audio_config=texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3, speaking_rate=1.05),
    )
    return Response(content=audio.audio_content, media_type="audio/mpeg")


# Serve static frontend files only from public directory
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
