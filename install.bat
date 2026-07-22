@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在安装 PR 字幕识别扩展...

set "DEST=%APPDATA%\Adobe\CEP\extensions\PRSubtitleRecognizer"

if not exist "%APPDATA%\Adobe\CEP\extensions" mkdir "%APPDATA%\Adobe\CEP\extensions"

if exist "%DEST%" (
    echo 已存在旧版本，正在覆盖...
    rd /s /q "%DEST%"
)

xcopy /e /i /q "cep-extension\PRSubtitleRecognizer" "%DEST%"

echo.
echo 安装完成！
echo 扩展已复制到: %DEST%
echo.
echo 请重启 Premiere，从 Window ^> Extensions ^> PR 字幕识别 打开。
pause
