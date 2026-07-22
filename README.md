# PR Subtitle Recognizer

A CEP panel prototype for Adobe Premiere Pro. It exports the full mix of the
currently active sequence to WAV, transcribes it with faster-whisper, writes a
UTF-8 SRT file, and imports that SRT into the Premiere project panel.

## Features

- NVIDIA CUDA is attempted first using float16 for fast transcription.
- Automatic CPU int8 fallback keeps the plug-in usable without a CUDA-capable GPU.
- The panel renders the whole active sequence with Premiere's WAV export preset,
  then automatically imports the generated SRT into the current project. Adding
  it to the active sequence remains an optional follow-up action.
- Processing happens locally. The media is not uploaded to a cloud service.

## Requirements

- Premiere Pro with CEP extensions enabled.
- Python 3.10 or later.
- FFmpeg available through `PATH`.
- For CUDA acceleration, an NVIDIA GPU, a working NVIDIA driver, and CUDA
  runtime libraries compatible with CTranslate2 are required.

  The service attempts CUDA first and automatically falls back to CPU if CUDA
  libraries are missing. For GPU recognition with current faster-whisper,
  install CUDA 12 cuBLAS and the compatible cuDNN runtime, then restart the
  service.

## Setup

1. Install the local service dependencies:

   ```powershell
   cd server
   python -m pip install -r requirements.txt
   ```

2. Start the local service:

   ```powershell
   python app.py
   ```

   The terminal reports `CUDA` or `CPU` for each transcription.

   If direct Hugging Face downloads are blocked on your network, use
   `./start-with-hf-mirror.ps1` from the `server` directory instead. The first
   transcription downloads the selected model. For a fully offline setup, set
   `PR_SUBTITLE_MODEL_DIR` to a downloaded `Systran/faster-whisper-*` model
   directory that contains `config.json`.

3. Copy `cep-extension/PRSubtitleRecognizer` into your CEP extensions folder:

   ```text
   Windows: %APPDATA%\Adobe\CEP\extensions\
   macOS:   ~/Library/Application Support/Adobe/CEP/extensions/
   ```

4. During development, set CEP `PlayerDebugMode` to `1`, restart Premiere,
   then open **PR Subtitle Recognizer** from `Window > Extensions`.

5. Open the target Premiere sequence first, then click **Transcribe active
   sequence**. The panel exports the sequence's complete audio mix, recognizes
   it, shows the elapsed-audio progress in the panel, and imports the SRT into
   the project panel. You can optionally add it to the active sequence later.

## Project layout

```text
cep-extension/PRSubtitleRecognizer/  CEP panel and Premiere scripts
server/                              Local faster-whisper service
```
