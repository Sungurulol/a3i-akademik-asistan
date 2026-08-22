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

:: ── A3I guncelleme kontrolu ──────────────────
SET "REPO_DIR=%SCRIPT_DIR%.."
IF NOT EXIST "%REPO_DIR%\.git" GOTO SKIP_REPO_UPDATE

echo  A3I guncellemeleri kontrol ediliyor...
pushd "%REPO_DIR%"
SET "OLD_COMMIT="
SET "NEW_COMMIT="
FOR /f "delims=" %%h IN ('git rev-parse @ 2^>nul') DO SET "OLD_COMMIT=%%h"
git fetch --quiet >nul 2>&1
FOR /f "delims=" %%h IN ('git rev-parse @{u} 2^>nul') DO SET "NEW_COMMIT=%%h"
popd

IF NOT DEFINED OLD_COMMIT GOTO SKIP_REPO_UPDATE
IF NOT DEFINED NEW_COMMIT GOTO SKIP_REPO_UPDATE
IF "%OLD_COMMIT%"=="%NEW_COMMIT%" (
  echo  A3I guncel.
  GOTO SKIP_REPO_UPDATE
)

echo  Yeni guncelleme bulundu, indiriliyor...
pushd "%REPO_DIR%"
git pull --quiet
popd

SET "KURULUM_CHANGED="
pushd "%REPO_DIR%"
FOR /f "delims=" %%f IN ('git diff --name-only "%OLD_COMMIT%" "%NEW_COMMIT%" 2^>nul ^| findstr /i "kurulum.bat"') DO SET "KURULUM_CHANGED=%%f"
popd
IF DEFINED KURULUM_CHANGED (
  echo  Kurulum guncellendi, yeniden kuruluyor...
  call "%SCRIPT_DIR%kurulum.bat"
)

echo  Bagimliliklar guncelleniyor...
pushd "%SCRIPT_DIR%backend"
call npm install --silent
popd
echo  A3I guncellendi.

:SKIP_REPO_UPDATE

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
