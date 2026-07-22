@echo off
chcp 65001 >nul
title PR 字幕识别安装程序

echo.
echo ============================================
echo         PR 字幕识别 扩展安装程序
echo ============================================
echo.

set "SRC=%~dp0cep-extension\PRSubtitleRecognizer"
set "DEST=%APPDATA%\Adobe\CEP\extensions\PRSubtitleRecognizer"

echo [1/5] 检查插件文件...

if not exist "%SRC%" (
    echo [错误] 找不到插件目录：%SRC%
    pause
    exit /b
)
echo [√] 插件目录存在
echo.

echo [2/5] 安装位置：%DEST%
echo.

if exist "%DEST%" (
    echo 检测到已安装旧版本，正在覆盖...
    rd /S /Q "%DEST%"
)
echo.

echo [3/5] 创建插件目录...
if not exist "%APPDATA%\Adobe\CEP\extensions" mkdir "%APPDATA%\Adobe\CEP\extensions"
echo 完成。
echo.

echo [4/5] 正在复制文件...
xcopy "%SRC%" "%DEST%" /E /I /Y
if errorlevel 1 (
    echo [错误] 插件复制失败！
    pause
    exit /b
)
echo.
echo [5/5] 安装完成！
echo.
echo 扩展已安装到：%DEST%
echo 请重启 Premiere，从 Window ^> Extensions ^> PR 字幕识别 打开。
echo.
pause
