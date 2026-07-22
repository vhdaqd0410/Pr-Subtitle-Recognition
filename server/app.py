"""Local transcription API for the PR Subtitle Recognizer panel."""

from __future__ import annotations

import os
import sys
import threading
import time
import traceback
import uuid
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Callable, Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel
from faster_whisper import WhisperModel, download_model

app = FastAPI(title="PR Subtitle Recognizer", version="0.2.0")
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


class SequenceTranscriptionRequest(BaseModel):
    media_path: str
    language: str = "auto"
    model: ModelName = "small"


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
    try:
        result = transcribe_file(
            Path(request.media_path), request.language, request.model,
            lambda progress, message: update_job(job_id, progress, message),
        )
        with jobs_lock:
            jobs[job_id].update(
                state="completed", progress=100, message="识别完成，正在生成字幕。",
                result=result, updated_at=time.time(),
            )
    except Exception as error:
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)
