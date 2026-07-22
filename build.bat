@echo off
chcp 65001 >nul
echo ============================================
echo   PR Subtitle Recognizer - 便携版打包
echo ============================================
echo.

cd /d "%~dp0"
set "DIST=%~dp0portable"

:: ── 1. 安装 PyInstaller ──────────────────────────
echo [1/5] 安装 PyInstaller...
pip install pyinstaller
if %errorlevel% neq 0 (
    echo 安装失败，请检查网络连接。
    pause
    exit /b 1
)

:: ── 2. 编译服务端 ──────────────────────────────
echo.
echo [2/5] 编译服务端为单文件 exe...
cd server
pyinstaller --onefile --name pr-subtitle-server ^
    --hidden-import=uvicorn.logging ^
    --hidden-import=uvicorn.loops ^
    --hidden-import=uvicorn.loops.auto ^
    --hidden-import=uvicorn.protocols ^
    --hidden-import=uvicorn.protocols.http ^
    --hidden-import=uvicorn.protocols.http.auto ^
    --hidden-import=uvicorn.protocols.websockets ^
    --hidden-import=uvicorn.protocols.websockets.auto ^
    --hidden-import=uvicorn.lifespan ^
    --hidden-import=uvicorn.lifespan.on ^
    --hidden-import=faster_whisper ^
    --hidden-import=ctranslate2 ^
    --collect-all faster_whisper ^
    --collect-all ctranslate2 ^
    app.py
if %errorlevel% neq 0 (
    echo 编译失败！
    pause
    exit /b 1
)
cd ..

:: ── 3. 组装便携目录 ─────────────────────────────
echo.
echo [3/5] 创建便携版目录...
if exist "%DIST%" rd /s /q "%DIST%"
mkdir "%DIST%"
mkdir "%DIST%\models\faster-whisper-small"
move server\dist\pr-subtitle-server.exe "%DIST%\"

:: ── 4. 拷贝模型和扩展 ──────────────────────────
echo [4/5] 拷贝模型和 CEP 扩展...
xcopy /e /i /q models "%DIST%\models" >nul
xcopy /e /i /q cep-extension "%DIST%\cep-extension" >nul

:: ── 5. 生成启动脚本 ─────────────────────────────
echo [5/5] 生成启动脚本和说明...
(
echo @echo off
echo chcp 65001 ^>nul
echo cd /d "%%~dp0"
echo echo ====================================
echo echo   PR Subtitle Recognizer v0.2.0
echo echo ====================================
echo echo.
echo echo 服务地址: http://127.0.0.1:8765
echo echo 模型目录: models\faster-whisper-small
echo echo 推理设备: CPU
echo echo.
echo set PR_SUBTITLE_DEVICE=cpu
echo pr-subtitle-server.exe
echo pause
) > "%DIST%\启动服务.bat"

(
echo 使用说明
echo ========
echo.
echo 1. 将 portable\cep-extension\PRSubtitleRecognizer 复制到 CEP 扩展目录:
echo    %%APPDATA%%\Adobe\CEP\extensions\
echo.
echo 2. 确保系统已安装 FFmpeg 并加入 PATH。
echo    下载: https://ffmpeg.org/download.html
echo.
echo 3. 双击 "启动服务.bat"，看到 Uvicorn 启动信息即可。
echo.
echo 4. 打开 Premiere Pro，Window ^> Extensions ^> PR 字幕识别。
echo.
echo 注意: 本包默认使用 CPU 推理。如需 CUDA 加速，编辑 启动服务.bat，
echo 删除 "set PR_SUBTITLE_DEVICE=cpu" 这一行。
) > "%DIST%\README.txt"

:: ── 完成 ──
echo.
echo ============================================
echo   打包完成！
echo   便携版目录: portable\
echo ============================================
echo.
echo 分发方法:
echo   将 portable\ 整个文件夹压缩为 zip，发到新电脑解压即用。
echo.
echo 新电脑使用步骤:
echo   1. 解压 portable.zip
echo   2. 把 cep-extension\PRSubtitleRecognizer 复制到 CEP 扩展目录
echo   3. 装好 FFmpeg
echo   4. 双击 启动服务.bat
pause
