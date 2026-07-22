@echo off
title PR Subtitle Recognizer - Install
echo.
echo ============================================
echo   PR Subtitle Recognizer - Install Plugin
echo ============================================
echo.

set "SRC=%~dp0cep-extension\PRSubtitleRecognizer"
set "DEST=%APPDATA%\Adobe\CEP\extensions\PRSubtitleRecognizer"

echo [1/5] Checking plugin files...
if not exist "%SRC%" (
    echo [ERROR] Plugin not found: %SRC%
    pause
    exit /b 1
)
echo [OK] Plugin folder found.
echo.

echo [2/5] Target: %DEST%
echo.

if exist "%DEST%" (
    echo Old version found, removing...
    rd /S /Q "%DEST%"
)
echo.

echo [3/5] Creating CEP extensions folder...
if not exist "%APPDATA%\Adobe\CEP\extensions" mkdir "%APPDATA%\Adobe\CEP\extensions"
echo Done.
echo.

echo [4/5] Copying plugin files...
xcopy "%SRC%" "%DEST%" /E /I /Y
if errorlevel 1 (
    echo [ERROR] Copy failed!
    pause
    exit /b 1
)
echo.

echo [5/5] Install complete!
echo.
echo Plugin installed to: %DEST%
echo Restart Premiere, then: Window ^> Extensions ^> PR Subtitle Recognizer
echo.
pause
