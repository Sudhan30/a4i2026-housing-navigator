import os
import httpx
from fastapi import Body, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Stabilization Navigator Intake Desk")

TARGET_AGENT_URL = os.environ.get(
    "AGENT_URL",
    "https://sq7-stabilization-navigator-530357188502.us-central1.run.app"
)

# Non-blocking proxy to the ADK agent. A blocking client inside async handlers
# froze the whole server while waiting and could stall concurrent requests.
_agent = httpx.AsyncClient(
    base_url=TARGET_AGENT_URL,
    timeout=httpx.Timeout(connect=10.0, read=170.0, write=30.0, pool=10.0),
    limits=httpx.Limits(max_connections=50, max_keepalive_connections=10, keepalive_expiry=30.0),
)


def _passthrough(resp: httpx.Response) -> Response:
    return Response(content=resp.content, status_code=resp.status_code, media_type=resp.headers.get("content-type"))


@app.get("/apps/{path:path}")
async def proxy_apps_get(path: str, request: Request):
    headers = {"Accept": request.headers["accept"]} if "accept" in request.headers else {}
    try:
        return _passthrough(await _agent.get(f"/apps/{path}", headers=headers))
    except httpx.HTTPError as e:
        return JSONResponse({"error": f"Agent unreachable: {type(e).__name__}"}, status_code=502)


@app.post("/apps/{path:path}")
async def proxy_apps(path: str, request: Request):
    headers = {"Content-Type": request.headers.get("content-type", "application/json")}
    try:
        return _passthrough(await _agent.post(f"/apps/{path}", content=await request.body(), headers=headers))
    except httpx.HTTPError as e:
        return JSONResponse({"error": f"Agent unreachable: {type(e).__name__}"}, status_code=502)


@app.post("/run")
async def proxy_run(request: Request):
    headers = {"Content-Type": request.headers.get("content-type", "application/json")}
    try:
        return _passthrough(await _agent.post("/run", content=await request.body(), headers=headers))
    except httpx.TimeoutException:
        return JSONResponse({"error": "Hearth took too long to answer. Please send the message again."}, status_code=504)
    except httpx.HTTPError as e:
        return JSONResponse({"error": f"Agent unreachable: {type(e).__name__}. Please try again."}, status_code=502)


# ---- Google Cloud speech + maps config ---------------------------------
# The service runs as its Cloud Run service account, so Speech-to-Text and
# Text-to-Speech need no keys. The Maps key is browser-side and restricted
# to this site's referrers; it is passed in via the MAPS_API_KEY env var.
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


# ---- Saved cases (Google Firestore) -------------------------------------
# One document per case in the "cases" collection. No tenant names or unit
# numbers are stored: 100-block addresses only (see AGENTS.md rule 7).
import re as _re
from datetime import datetime as _dt, timezone as _tz

_CASE_ID = _re.compile(r"^[A-Za-z0-9_-]{6,64}$")
_SUMMARY_FIELDS = ("id", "block", "hearingAt", "hearingLabel", "status", "worstHazard",
                   "nextAction", "recordCount", "eligibleFunds", "edited", "updatedAt", "title")
_fs = None


def _cases():
    global _fs
    if _fs is None:
        from google.cloud import firestore
        _fs = firestore.Client()
    return _fs.collection("cases")


@app.get("/api/cases")
def list_cases():
    docs = _cases().order_by("hearingAt").limit(100).stream()
    out = []
    for d in docs:
        c = d.to_dict() or {}
        if c.get("status") == "closed":
            continue
        out.append({k: c.get(k) for k in _SUMMARY_FIELDS})
    return {"cases": out}


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    if not _CASE_ID.match(case_id):
        return JSONResponse({"error": "bad id"}, status_code=400)
    snap = _cases().document(case_id).get()
    if not snap.exists:
        return JSONResponse({"error": "not found"}, status_code=404)
    return snap.to_dict()


@app.delete("/api/cases/{case_id}")
def delete_case(case_id: str):
    if not _CASE_ID.match(case_id):
        return JSONResponse({"error": "bad id"}, status_code=400)
    _cases().document(case_id).delete()
    # Tombstone: stops another open tab's autosave from silently re-creating the case.
    _cases()._client.collection("deleted_cases").document(case_id).set({"deletedAt": _dt.now(_tz.utc).isoformat()})
    return {"ok": True}


@app.put("/api/cases/{case_id}")
async def save_case(case_id: str, request: Request):
    if not _CASE_ID.match(case_id):
        return JSONResponse({"error": "bad id"}, status_code=400)
    if _cases()._client.collection("deleted_cases").document(case_id).get().exists:
        return JSONResponse({"error": "This case was deleted."}, status_code=410)
    raw = await request.body()
    if len(raw) > 900_000:  # Firestore documents max out at 1 MiB
        return JSONResponse({"error": "case too large"}, status_code=413)
    import json as _json
    data = _json.loads(raw)
    data["id"] = case_id
    data["updatedAt"] = _dt.now(_tz.utc).isoformat()
    _cases().document(case_id).set(data)
    return {"ok": True, "updatedAt": data["updatedAt"]}


# ---- Multimodal intake (Gemini 2.5 Flash on Vertex AI) -------------------
# Photos of conditions, court notices and audio files. Structured output only;
# failures are returned as errors, never replaced with invented results.
_IMG_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
_AUDIO_TYPES = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/flac"}
_genai = None


def _gemini():
    global _genai
    if _genai is None:
        from google import genai
        _genai = genai.Client(vertexai=True, project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
                              location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"))
    return _genai


def _structured(data: bytes, mime: str, prompt: str, schema: dict):
    import json as _json
    from google.genai import types as gt
    resp = _gemini().models.generate_content(
        model=os.environ.get("VISION_MODEL", "gemini-2.5-flash"),
        contents=[gt.Part.from_bytes(data=data, mime_type=mime), prompt],
        config=gt.GenerateContentConfig(temperature=0.1, response_mime_type="application/json", response_schema=schema),
    )
    return _json.loads(resp.text)


_PHOTO_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "is_housing_condition": {"type": "BOOLEAN"},
        "condition": {"type": "STRING", "description": "Short name, e.g. 'Black mold', 'Ceiling water leak', 'Exposed wiring'."},
        "observed": {"type": "STRING", "description": "One or two plain sentences on what is visible."},
        "hazard_estimate": {"type": "STRING", "enum": ["Immediately hazardous", "Hazardous", "Non-hazardous", "Unclear"]},
        "matching_hazards": {"type": "ARRAY", "items": {"type": "STRING", "enum": ["no heat", "mold", "water leak", "electrical", "sewage", "pests", "other"]}},
        "cannot_prove": {"type": "ARRAY", "items": {"type": "STRING"}, "description": "What this photo alone cannot establish."},
    },
    "required": ["is_housing_condition", "condition", "observed", "hazard_estimate", "matching_hazards", "cannot_prove"],
}

_NOTICE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "is_court_document": {"type": "BOOLEAN"},
        "document_type": {"type": "STRING", "description": "e.g. Notice of Petition, 14-day rent demand, other."},
        "index_number": {"type": "STRING", "nullable": True},
        "hearing_datetime": {"type": "STRING", "nullable": True, "description": "ISO 'YYYY-MM-DDTHH:MM' if printed."},
        "court": {"type": "STRING", "nullable": True},
        "arrears_usd": {"type": "NUMBER", "nullable": True},
        "landlord_or_petitioner": {"type": "STRING", "nullable": True},
        "date_served_or_dated": {"type": "STRING", "nullable": True},
        "notes": {"type": "STRING", "description": "Anything unclear or missing. Never include the tenant's name or apartment number."},
    },
    "required": ["is_court_document", "document_type", "notes"],
}


@app.post("/api/inspect-photo")
def inspect_photo(body: bytes = Body(..., media_type="application/octet-stream"), mime: str = "image/jpeg"):
    if mime not in _IMG_TYPES or not body or len(body) > 8_000_000:
        return JSONResponse({"error": "Upload a JPEG, PNG, WEBP or HEIC photo under 8 MB."}, status_code=400)
    prompt = ("You assist a legal-aid paralegal in NYC housing court. Describe the housing condition in this "
              "tenant photo factually. Estimate severity using NYC HPD terms (Immediately hazardous / Hazardous / "
              "Non-hazardous) as a visual estimate only. List what the photo cannot prove (for example the date taken, "
              "whether it is inside the tenant's own unit, whether it was since repaired). Do not identify people.")
    try:
        return {"result": _structured(body, mime, prompt, _PHOTO_SCHEMA)}
    except Exception as e:  # surface the failure; never fabricate an analysis
        return JSONResponse({"error": f"Photo analysis failed: {type(e).__name__}"}, status_code=502)


@app.post("/api/read-notice")
def read_notice(body: bytes = Body(..., media_type="application/octet-stream"), mime: str = "image/jpeg"):
    if (mime not in _IMG_TYPES and mime != "application/pdf") or not body or len(body) > 10_000_000:
        return JSONResponse({"error": "Upload a photo or PDF of the notice under 10 MB."}, status_code=400)
    prompt = ("Extract case details from this NYC housing court document (Notice of Petition, 14-day rent demand, "
              "or similar). Return only what is printed; use null when a field is absent or unreadable. "
              "Do NOT return the tenant's name or apartment number.")
    try:
        return {"result": _structured(body, mime, prompt, _NOTICE_SCHEMA)}
    except Exception as e:
        return JSONResponse({"error": f"Notice reading failed: {type(e).__name__}"}, status_code=502)


@app.post("/api/transcribe-file")
def transcribe_file(body: bytes = Body(..., media_type="application/octet-stream"), mime: str = "audio/mpeg"):
    if mime not in _AUDIO_TYPES or not body or len(body) > 15_000_000:
        return JSONResponse({"error": "Upload an audio file (mp3, m4a, wav, webm, ogg) under 15 MB."}, status_code=400)
    from google.genai import types as gt
    prompt = ("Transcribe this intake recording verbatim in its original language, then add one line starting "
              "'English summary:' if it is not in English. Replace any personal names and apartment numbers with "
              "[name] and [unit].")
    try:
        resp = _gemini().models.generate_content(
            model=os.environ.get("VISION_MODEL", "gemini-2.5-flash"),
            contents=[gt.Part.from_bytes(data=body, mime_type=mime), prompt],
            config=gt.GenerateContentConfig(temperature=0.0),
        )
        return {"transcript": (resp.text or "").strip()}
    except Exception as e:
        return JSONResponse({"error": f"Transcription failed: {type(e).__name__}"}, status_code=502)


# Serve static frontend files only from public directory
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
