# Starts the local server through a Hugging Face-compatible mirror.
# The endpoint can be replaced with an organization-approved Hub endpoint.
$env:HF_ENDPOINT = 'https://hf-mirror.com'
$env:HF_HOME = Join-Path $env:LOCALAPPDATA 'PRSubtitleRecognizer\huggingface'
$env:PR_SUBTITLE_MODEL_CACHE = Join-Path $env:LOCALAPPDATA 'PRSubtitleRecognizer\huggingface'
$env:HF_HUB_DOWNLOAD_TIMEOUT = '120'
python "$PSScriptRoot\app.py"
