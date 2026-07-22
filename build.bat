@echo off
echo ============================================
echo   PR Subtitle Recognizer - Portable Build
echo ============================================
echo.

cd /d "%~dp0"
set "DIST=%~dp0portable"

echo [1/5] Installing PyInstaller...
pip install pyinstaller
if %errorlevel% neq 0 (
    echo Failed to install PyInstaller. Check network.
    pause
    exit /b 1
)

echo.
echo [2/5] Building server executable...
cd server
pyinstaller --onefile --name pr-subtitle-server --hidden-import=uvicorn.logging --hidden-import=uvicorn.loops --hidden-import=uvicorn.loops.auto --hidden-import=uvicorn.protocols --hidden-import=uvicorn.protocols.http --hidden-import=uvicorn.protocols.http.auto --hidden-import=uvicorn.protocols.websockets --hidden-import=uvicorn.protocols.websockets.auto --hidden-import=uvicorn.lifespan --hidden-import=uvicorn.lifespan.on --hidden-import=faster_whisper --hidden-import=ctranslate2 --collect-all faster_whisper --collect-all ctranslate2 app.py
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [3/5] Creating portable directory...
if exist "%DIST%" rd /s /q "%DIST%"
mkdir "%DIST%"
mkdir "%DIST%\models\faster-whisper-small"
move server\dist\pr-subtitle-server.exe "%DIST%\"

echo [4/5] Copying model and CEP extension...
xcopy /e /i /q models "%DIST%\models" >/dev/null
xcopy /e /i /q cep-extension "%DIST%\cep-extension" >/dev/null

echo [5/5] Creating launcher scripts...
(
echo @echo off
echo cd /d "%%~dp0"
echo echo ====================================
echo echo   PR Subtitle Recognizer v0.2.0
echo echo   Server: http://127.0.0.1:8765
echo echo   Device: CPU
echo echo ====================================
echo echo.
echo set PR_SUBTITLE_DEVICE=cpu
echo pr-subtitle-server.exe
echo pause
) > "%DIST%\start.bat"

(
echo === PR Subtitle Recognizer - Quick Start ===
echo.
echo 1. Copy cep-extension\PRSubtitleRecognizer to:
echo    %%APPDATA%%\Adobe\CEP\extensions\
echo.
echo 2. Install FFmpeg and add it to PATH.
echo    Download: https://ffmpeg.org/download.html
echo.
echo 3. Double-click start.bat to launch the server.
echo.
echo 4. Open Premiere Pro, Window ^> Extensions ^> PR Subtitle Recognizer.
echo.
echo Note: This package uses CPU by default.
echo To enable CUDA, remove "set PR_SUBTITLE_DEVICE=cpu" from start.bat.
) > "%DIST%\README.txt"

echo.
echo ============================================
echo   Build complete!
echo   Output: portable\
echo ============================================
echo.
echo To distribute: zip the portable\ folder and share.
echo.
echo To use on another PC:
echo   1. Unzip portable.zip
echo   2. Copy cep-extension to CEP extensions dir
echo   3. Install FFmpeg
echo   4. Double-click start.bat
pause
