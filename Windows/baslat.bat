@echo off
chcp 65001 >nul
title A³I — Akademik Asistan AI

SET SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"
SET PORT=3000

cls
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║     A³I — Akademik Asistan AI           ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ── Kurulum kontrolü ────────────────────────
IF NOT EXIST "%SCRIPT_DIR%backend\node_modules" (
  echo  [HATA] Kurulum bulunamadi. Once kurulum.bat calistirin.
  pause & exit /b 1
)

where claude >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo  [HATA] Claude Code bulunamadi. Once kurulum.bat calistirin.
  pause & exit /b 1
)

:: ── Skills güncelle ─────────────────────────
echo  Skills guncelleniyor...
IF EXIST "%SCRIPT_DIR%skills\academic-research-skills\.git" (
  cd "%SCRIPT_DIR%skills\academic-research-skills"
  git pull --quiet origin main 2>nul || git pull --quiet origin master 2>nul
  cd "%SCRIPT_DIR%"
  echo  Skills guncel.
) ELSE (
  IF NOT EXIST "%SCRIPT_DIR%skills" mkdir "%SCRIPT_DIR%skills"
  git clone https://github.com/Imbad0202/academic-research-skills.git "%SCRIPT_DIR%skills\academic-research-skills"
  echo  Skills indirildi.
)

:: ── Claude oturumu yenile ───────────────────
echo  Claude oturumu yenileniyor...
claude auth logout >nul 2>&1
claude auth login
echo  Oturum yenilendi.

:: ── Önceki oturumu kapat ────────────────────
for /f "tokens=5" %%a in ('netstat -aon ^| find ":%PORT%" ^| find "LISTENING"') do (
  taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── Backend başlat ───────────────────────────
echo  Sunucu baslatiliyor...
start /b node "%SCRIPT_DIR%backend\server.js"

:: Hazır olmasını bekle
:WAIT_LOOP
timeout /t 1 /nobreak >nul
curl -s "http://localhost:%PORT%/api/health" >nul 2>&1
IF %ERRORLEVEL% NEQ 0 GOTO WAIT_LOOP

echo  Sunucu hazir.
echo  Tarayici aciliyor...
timeout /t 1 /nobreak >nul
start "" "http://localhost:%PORT%"

echo.
echo  A3I calisiyor -- http://localhost:%PORT%
echo.
echo  ──────────────────────────────────────────
echo  Durdurmak icin bu pencereyi kapatin.
echo  ──────────────────────────────────────────
echo.
pause
