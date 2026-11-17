import os
import requests
from fastapi import FastAPI, Request, Response
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

# Serve static frontend files only from public directory
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
