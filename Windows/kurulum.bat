@echo off
chcp 65001 >nul
title A³I — Akademik Asistan AI Kurulum

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║     A³I — Akademik Asistan AI           ║
echo  ║     Windows Kurulum                      ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  İnternet bağlantısı gereklidir.
echo  Yaklaşık 5-10 dakika sürebilir.
echo.
pause

SET SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

:: ── Chocolatey ──────────────────────────────
echo.
echo  [1/6] Chocolatey kontrol ediliyor...
where choco >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo  Chocolatey kuruluyor...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
  echo  Chocolatey kuruldu.
) ELSE (
  echo  Chocolatey zaten kurulu.
)

:: ── Node.js ─────────────────────────────────
echo.
echo  [2/6] Node.js kontrol ediliyor...
where node >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo  Node.js kuruluyor...
  choco install nodejs-lts -y
  CALL refreshenv
  echo  Node.js kuruldu.
) ELSE (
  echo  Node.js zaten kurulu.
)

:: ── Python & MarkItDown ─────────────────────
echo.
echo  [3/6] Python kontrol ediliyor...
where python >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo  Python kuruluyor...
  choco install python -y
  CALL refreshenv
  echo  Python kuruldu.
) ELSE (
  echo  Python zaten kurulu.
)

echo  MarkItDown kuruluyor (dosya isleme icin)...
pip install --user "markitdown[pdf,docx,pptx,xlsx]" --quiet
echo  MarkItDown kuruldu.

:: ── Claude Code ─────────────────────────────
echo.
echo  [4/6] Claude Code kontrol ediliyor...
where claude >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo  Claude Code kuruluyor...
  npm install -g @anthropic-ai/claude-code
  echo  Claude Code kuruldu.
) ELSE (
  echo  Claude Code zaten kurulu.
)

:: ── npm paketleri ───────────────────────────
echo.
echo  [5/6] Backend paketleri kuruluyor...
cd "%SCRIPT_DIR%backend"
npm install
cd "%SCRIPT_DIR%"
echo  Paketler hazır.

:: ── Skills repo ─────────────────────────────
echo.
echo  [6/6] Akademik skill dosyaları indiriliyor...
IF NOT EXIST "%SCRIPT_DIR%skills\academic-research-skills\.claude" (
  IF NOT EXIST "%SCRIPT_DIR%skills" mkdir "%SCRIPT_DIR%skills"
  git clone https://github.com/Imbad0202/academic-research-skills.git "%SCRIPT_DIR%skills\academic-research-skills"
  echo  Skills indirildi.
) ELSE (
  echo  Skills zaten mevcut.
)

:: ── Claude oturumu ───────────────────────────
echo.
echo  Claude hesabınıza giriş yapılacak.
echo  Tarayıcı açılacak — Anthropic hesabınızla giriş yapın.
echo.
pause
claude auth login

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║        Kurulum Tamamlandı!               ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Kullanmak için: baslat.bat dosyasına çift tıklayın.
echo.
pause
