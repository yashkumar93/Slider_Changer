@echo off
setlocal

REM Register the Chrome Native Messaging host for the current Windows user.
REM Run this file once after extracting the project. Administrator rights are not required.

set "ROOT=%~dp0"
set "MANIFEST=%ROOT%extension\native-host\com.slides_phone_remote.json"

if not exist "%ROOT%extension\native-host\slides_remote_host.exe" (
  echo ERROR: slides_remote_host.exe was not found.
  pause
  exit /b 1
)

if not exist "%MANIFEST%" (
  echo ERROR: Native messaging manifest was not found.
  pause
  exit /b 1
)

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.slides_phone_remote" /ve /t REG_SZ /d "%MANIFEST%" /f >nul
if errorlevel 1 (
  echo ERROR: Could not register the native messaging host.
  pause
  exit /b 1
)

echo.
echo Native messaging host installed successfully.
echo.
echo Next:
echo   1. Go to chrome://extensions
echo   2. Enable Developer mode.
echo   3. Click Load unpacked and select:
echo      %ROOT%extension
echo   4. Click the Slides Phone Remote extension icon.
echo.
echo Opening the extension will now start the server automatically.
pause
