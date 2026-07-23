"""Local transcription API for the PR Subtitle Recognizer panel."""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import traceback
import urllib.request
import uuid
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Callable, Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel
from faster_whisper import WhisperModel, download_model

app = FastAPI(title="PR Subtitle Recognizer", version="3.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"detail": str(exc)})

ModelName = Literal["tiny", "base", "small", "medium", "large-v3"]
models: dict[tuple[str, str], WhisperModel] = {}
last_device = "not checked"
jobs: dict[str, dict[str, object]] = {}
jobs_lock = threading.Lock()
start_time = time.time()

# Log buffer
log_lines: list[str] = []
log_lock = threading.Lock()

def add_log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    with log_lock:
        log_lines.append(f"[{ts}] {msg}")
        if len(log_lines) > 200:
            log_lines[:] = log_lines[-150:]


def vocal_isolate(media_path: Path, progress_callback: Callable[[int, str], None] | None = None) -> Path:
    """Extract center channel (vocals) from stereo audio."""
    import av
    import numpy as np
    if progress_callback:
        progress_callback(2, "正在分离人声（中心声道提取）…")
    output_path = media_path.with_suffix(".vocals.wav")
    ic = av.open(str(media_path))
    st = ic.streams.audio[0]
    oc = av.open(str(output_path), "w")
    os_ = oc.add_stream("pcm_s16le", rate=16000)
    os_.channels = 1
    for pkt in ic.demux(st):
        for frm in pkt.decode():
            arr = frm.to_ndarray()
            if arr.ndim >= 2 and arr.shape[0] >= 2:
                arr = ((arr[0].astype(np.float32) + arr[1].astype(np.float32)) * 0.5).astype(np.int16)
            elif arr.ndim >= 2:
                arr = arr[0]
            nf = av.AudioFrame.from_ndarray(arr.reshape(1, -1), format="s16", layout="mono")
            nf.sample_rate = 16000
            for p in os_.encode(nf):
                oc.mux(p)
    for p in os_.encode(None):
        oc.mux(p)
    oc.close()
    ic.close()
    return output_path


class SequenceTranscriptionRequest(BaseModel):
    media_path: str
    language: str = "auto"
    model: ModelName = "small"
    provider: str = "local"
    vocal_isolate: bool = False
    api_base: str = ""
    api_key: str = ""
    api_model: str = "whisper-1"


class TranslateRequest(BaseModel):
    text: str
    target: str
    api_base: str = ""
    api_key: str = ""
    model: str = "gpt-4o-mini"


def timestamp(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    seconds, milliseconds = divmod(milliseconds, 1_000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def to_srt(
    segments: object,
    duration: float | None = None,
    progress_callback: Callable[[int, str], None] | None = None,
) -> str:
    blocks: list[str] = []
    for index, segment in enumerate(segments, start=1):
        text = segment.text.strip()
        if text:
            blocks.append(f"{index}\n{timestamp(segment.start)} --> {timestamp(segment.end)}\n{text}")
        if duration and progress_callback:
            percentage = min(97, max(8, int(segment.end / duration * 100)))
            progress_callback(percentage, f"正在识别语音：{timestamp(segment.end).replace(',', '.')} / {timestamp(duration).replace(',', '.')}")
    return "\n\n".join(blocks) + ("\n" if blocks else "")


def transcribe_openai(
    media_path: Path,
    language: str,
    api_base: str,
    api_key: str,
    api_model: str,
    progress_callback: Callable[[int, str], None] | None = None,
) -> str:
    """Transcribe via OpenAI Whisper API (or compatible endpoint)."""
    base = api_base.rstrip("/")
    url = f"{base}/audio/transcriptions"
    if progress_callback:
        progress_callback(10, "正在上传音频至 API…")

    # Build multipart form data manually
    boundary = "----WhisperBoundary" + uuid.uuid4().hex[:16]
    body_lines: list[bytes] = []

    def _add_field(name: str, value: str) -> None:
        body_lines.append(f"--{boundary}".encode())
        body_lines.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        body_lines.append(b"")
        body_lines.append(value.encode())

    _add_field("model", api_model)
    _add_field("response_format", "verbose_json")
    if language and language != "auto":
        _add_field("language", language)

    # File part
    file_bytes = media_path.read_bytes()
    filename = media_path.name
    body_lines.append(f"--{boundary}".encode())
    body_lines.append(f'Content-Disposition: form-data; name="file"; filename="{filename}"'.encode())
    body_lines.append(b"Content-Type: application/octet-stream")
    body_lines.append(b"")
    body_lines.append(file_bytes)
    body_lines.append(f"--{boundary}--".encode())
    body_lines.append(b"")

    body = b"\r\n".join(body_lines)

    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )

    if progress_callback:
        progress_callback(20, "正在等待 API 识别结果…")
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode() if e.fp else str(e)
        raise RuntimeError(f"API 请求失败 ({e.code}): {detail}") from e

    # Parse verbose_json response
    segments = data.get("segments", [])
    if not segments:
        text = data.get("text", "")
        if text:
            # Fallback: create a single segment from full text
            return f"1\n00:00:00,000 --> 00:00:05,000\n{text.strip()}\n"
        raise RuntimeError("API 未返回识别结果。")

    blocks: list[str] = []
    for idx, seg in enumerate(segments, start=1):
        seg_text = seg.get("text", "").strip()
        if seg_text:
            blocks.append(f"{idx}\n{timestamp(seg['start'])} --> {timestamp(seg['end'])}\n{seg_text}")
    return "\n\n".join(blocks) + ("\n" if blocks else "")


def resolve_model_path(name: ModelName) -> str:
    """Return an already-local model directory, or download it into the HF cache."""
    # 1. explicit env var override
    local_model_dir = os.environ.get("PR_SUBTITLE_MODEL_DIR")
    if local_model_dir:
        model_path = Path(local_model_dir)
        if not (model_path / "config.json").is_file():
            raise RuntimeError(
                "PR_SUBTITLE_MODEL_DIR must point to a faster-whisper model folder containing config.json"
            )
        return str(model_path)

    # 2. repo-bundled model (e.g. models/faster-whisper-small/)
    _app_dir = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent.parent
    bundled = _app_dir / "models" / f"faster-whisper-{name}"
    if (bundled / "config.json").is_file():
        return str(bundled)

    # 3. download from Hugging Face
    try:
        return download_model(name, cache_dir=os.environ.get("PR_SUBTITLE_MODEL_CACHE"))
    except Exception as error:
        endpoint = os.environ.get("HF_ENDPOINT", "https://huggingface.co")
        raise RuntimeError(
            "Unable to download the Whisper model from " + endpoint + ". "
            "Check the network endpoint, or set PR_SUBTITLE_MODEL_DIR to a downloaded local model folder. "
            f"Original error: {error}"
        ) from error


def get_cpu_model(model_path: str) -> WhisperModel:
    cpu_key = (model_path, "cpu")
    if cpu_key not in models:
        models[cpu_key] = WhisperModel(model_path, device="cpu", compute_type="int8")
    return models[cpu_key]


def get_model(name: ModelName) -> tuple[WhisperModel, str, str]:
    """Download once, then prefer CUDA (float16) with a CPU fallback."""
    model_path = resolve_model_path(name)
    force_cpu = os.environ.get("PR_SUBTITLE_DEVICE", "").lower() == "cpu"
    cuda_key = (model_path, "cuda")
    cpu_key = (model_path, "cpu")
    if force_cpu:
        return get_cpu_model(model_path), "cpu", model_path
    if cuda_key in models:
        return models[cuda_key], "cuda", model_path
    if cpu_key in models:
        return models[cpu_key], "cpu", model_path
    try:
        models[cuda_key] = WhisperModel(model_path, device="cuda", compute_type="float16")
        return models[cuda_key], "cuda", model_path
    except Exception as cuda_error:
        print(f"CUDA unavailable; using CPU instead: {cuda_error}")
        return get_cpu_model(model_path), "cpu", model_path


def transcribe_file(
    media_path: Path,
    language: str,
    model: ModelName,
    progress_callback: Callable[[int, str], None] | None = None,
) -> str:
    global last_device
    if not media_path.is_file():
        raise FileNotFoundError(f"Media file was not found: {media_path}")
    if progress_callback:
        progress_callback(3, "正在加载语音识别模型…")
    whisper_model, last_device, model_path = get_model(model)
    print(f"Transcribing with {last_device.upper()}, model={model}: {media_path.name}")

    def run_transcription(active_model: WhisperModel) -> str:
        if progress_callback:
            progress_callback(6, "正在分析音频，请稍候…")
        segments, info = active_model.transcribe(
            str(media_path), language=None if language == "auto" else language,
            beam_size=5, condition_on_previous_text=False,
        )
        duration = getattr(info, "duration", None)
        return to_srt(segments, duration, progress_callback)

    try:
        return run_transcription(whisper_model)
    except RuntimeError as cuda_error:
        cuda_libraries = ("cublas", "cudnn", "cuda runtime", "cuda driver")
        if last_device != "cuda" or not any(name in str(cuda_error).lower() for name in cuda_libraries):
            raise
        print(f"CUDA runtime is incomplete; retrying on CPU: {cuda_error}")
        last_device = "cpu"
        if progress_callback:
            progress_callback(4, "CUDA 运行库不完整，已切换至 CPU 识别…")
        return run_transcription(get_cpu_model(model_path))


def update_job(job_id: str, progress: int, message: str, state: str = "running") -> None:
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(progress=progress, message=message, state=state, updated_at=time.time())


def run_sequence_job(job_id: str, request: SequenceTranscriptionRequest) -> None:
    media_path = Path(request.media_path)
    file_name = media_path.name
    add_log(f"开始转写: {file_name} [{request.provider}]")
    try:
        if request.vocal_isolate:
            media_path = vocal_isolate(media_path, lambda p, m: update_job(job_id, p, m))
            file_name = media_path.name
        if request.provider == "openai" and request.api_key:
            result = transcribe_openai(
                media_path, request.language,
                request.api_base or "https://api.openai.com/v1",
                request.api_key, request.api_model,
                lambda progress, message: update_job(job_id, progress, message),
            )
        else:
            result = transcribe_file(
                media_path, request.language, request.model,
                lambda progress, message: update_job(job_id, progress, message),
            )
        with jobs_lock:
            jobs[job_id].update(
                state="completed", progress=100, message="识别完成，正在生成字幕。",
                result=result, updated_at=time.time(),
            )
        add_log(f"转写完成: {file_name}")
    except Exception as error:
        add_log(f"转写失败: {file_name} - {error}")
        update_job(job_id, 0, f"识别失败：{error}", "failed")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "device": last_device}


@app.post("/transcribe", response_class=PlainTextResponse)
async def transcribe(
    media: UploadFile = File(...),
    language: str = Form("auto"),
    model: ModelName = Form("small"),
) -> str:
    suffix = Path(media.filename or "media").suffix or ".mp4"
    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(delete=False, suffix=suffix) as temporary_file:
            temporary_path = Path(temporary_file.name)
            while chunk := await media.read(1024 * 1024):
                temporary_file.write(chunk)
        return transcribe_file(temporary_path, language, model)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {error}") from error
    finally:
        if temporary_path:
            temporary_path.unlink(missing_ok=True)


@app.post("/transcribe-path")
def transcribe_sequence_audio(request: SequenceTranscriptionRequest) -> dict[str, str]:
    """Start a background transcription job for the WAV mixdown exported by CEP."""
    media_path = Path(request.media_path)
    if not media_path.is_file():
        raise HTTPException(status_code=404, detail="Exported WAV file was not found")
    job_id = uuid.uuid4().hex
    with jobs_lock:
        jobs[job_id] = {
            "state": "queued", "progress": 0, "message": "识别任务已创建，等待启动…",
            "updated_at": time.time(),
        }
    threading.Thread(target=run_sequence_job, args=(job_id, request), daemon=True).start()
    return {"job_id": job_id}


@app.get("/jobs/{job_id}")
def get_transcription_job(job_id: str) -> dict[str, object]:
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Transcription job was not found")
        return job.copy()


@app.post("/translate")
def translate_text(request: TranslateRequest) -> dict[str, str]:
    """Translate SRT text via OpenAI-compatible API."""
    base = (request.api_base or "https://api.openai.com/v1").rstrip("/")
    url = f"{base}/chat/completions"
    lang_names = {"zh": "Chinese", "en": "English", "ja": "Japanese", "ko": "Korean"}
    target_name = lang_names.get(request.target, request.target)
    prompt = (
        f"Translate the following SRT subtitle content to {target_name}. "
        "For each subtitle entry, output the original text on one line "
        f"followed by the translated text on the next line. "
        "Preserve all SRT index numbers and timestamps exactly. "
        "Format:\n"
        "1\n00:00:01,000 --> 00:00:03,000\n"
        "Original text here\n"
        "Translated text here\n\n"
        f"{request.text}"
    )
    body = json.dumps({
        "model": request.model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {request.api_key}",
        "Content-Type": "application/json",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode() if e.fp else str(e)
        raise HTTPException(status_code=502, detail=f"翻译失败: {detail}")
    return {"text": data["choices"][0]["message"]["content"].strip()}


@app.get("/api/stats")
def api_stats() -> dict[str, object]:
    with jobs_lock:
        running = sum(1 for j in jobs.values() if j.get("state") in ("queued", "running"))
        completed = sum(1 for j in jobs.values() if j.get("state") == "completed")
        failed = sum(1 for j in jobs.values() if j.get("state") == "failed")
    uptime = int(time.time() - start_time)
    h, m = divmod(uptime, 3600)
    mm, ss = divmod(m, 60)
    with log_lock:
        logs = list(log_lines[-100:])
    return {
        "status": "running",
        "device": last_device,
        "uptime": f"{h}h {mm}m {ss}s",
        "jobs": {"running": running, "completed": completed, "failed": failed},
        "logs": logs,
    }


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard() -> str:
    return DASHBOARD_HTML


DASHBOARD_HTML = r"""<!doctype html>
<html lang=zh>
<head><meta charset=utf-8><title>PR 字幕识别 - 后台</title>
<style>
:root{color:#e0e0e0;background:#1e1e1e;font:14px/1.5 'Microsoft YaHei',sans-serif}
body{margin:0;padding:24px;max-width:720px;margin:0 auto}
h1{font-size:20px;margin:0 0 20px;color:#fff}
.card{background:#2a2a2a;border-radius:8px;padding:16px;margin-bottom:16px}
.card h2{font-size:14px;margin:0 0 12px;color:#aaa}
.stats{display:flex;gap:12px;flex-wrap:wrap}
.stat{flex:1;min-width:80px;text-align:center;padding:10px;background:#1e1e1e;border-radius:6px}
.stat .val{font-size:22px;font-weight:700;color:#fff}
.stat .lbl{font-size:11px;color:#888;margin-top:4px}
.green{color:#4caf50}.red{color:#f44336}.yellow{color:#ff9800}
#logs{background:#111;border-radius:6px;padding:12px;max-height:400px;overflow-y:auto;font:12px/1.6 Consolas,monospace;white-space:pre-wrap;word-break:break-all}
.refresh{float:right;font-size:12px;color:#888;background:#333;border:0;padding:4px 12px;border-radius:4px;cursor:pointer}
</style></head>
<body>
<h1>PR 字幕识别 后台管理 <button class=refresh onclick=load()>刷新</button></h1>
<div class=card><h2>服务状态</h2>
<div class=stats>
<div class=stat><div class="val green" id=status>●</div><div class=lbl>状态</div></div>
<div class=stat><div class=val id=device>-</div><div class=lbl>推理设备</div></div>
<div class=stat><div class=val id=uptime>-</div><div class=lbl>运行时间</div></div>
<div class=stat><div class=val id=running>-</div><div class=lbl>进行中</div></div>
<div class=stat><div class=val id=completed>-</div><div class=lbl>已完成</div></div>
<div class=stat><div class=val id=failed>-</div><div class=lbl>失败</div></div></div></div>
<div class=card><h2>运行日志</h2>
<div id=logs>加载中…</div></div>
<script>
async function load(){try{let r=await fetch('/api/stats'),d=await r.json();
document.getElementById('status').textContent=d.status==='running'?'● 运行中':'○ 已停止';
document.getElementById('device').textContent=d.device?.toUpperCase()||'-';
document.getElementById('uptime').textContent=d.uptime||'-';
document.getElementById('running').textContent=d.jobs?.running||0;
document.getElementById('completed').textContent=d.jobs?.completed||0;
document.getElementById('failed').textContent=d.jobs?.failed||0;
document.getElementById('logs').textContent=(d.logs||[]).join('\n')||'(空)';
}catch(e){document.getElementById('logs').textContent='无法连接服务';}}
load();setInterval(load,3000);
</script></body></html>"""


@app.post("/shutdown")
def shutdown() -> dict[str, str]:
    add_log("收到关闭请求")
    threading.Thread(target=_shutdown, daemon=True).start()
    return {"status": "shutting_down"}


def _shutdown() -> None:
    time.sleep(0.5)
    os._exit(0)


if __name__ == "__main__":
    import uvicorn
    add_log("服务启动")
    uvicorn.run(app, host="127.0.0.1", port=8765)
