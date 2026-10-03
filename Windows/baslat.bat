@echo off
setlocal EnableExtensions
chcp 65001 >nul
title A3I - Akademik Asistan AI

:: Not: Bu dosya bilerek yalnizca ASCII karakter icerir ve CRLF satir sonu
:: kullanir. cmd.exe UTF-8 / LF batch dosyalarinda GOTO ve satir okuma
:: hatalari yapabiliyor.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "PORT=3000"
set "REPO_DIR=%SCRIPT_DIR%.."
set "SKILLS_DIR=%SCRIPT_DIR%skills\academic-research-skills"

:: Kurulumdan sonra pencere yeniden acilmadiysa bu klasorler PATH'te
:: olmayabilir.
set "PATH=%PATH%;%USERPROFILE%\.local\bin;%APPDATA%\npm"

:: Claude Code Windows'ta Git Bash ister; standart yerde varsa yolu verilir.
if not defined CLAUDE_CODE_GIT_BASH_PATH if exist "%ProgramFiles%\Git\bin\bash.exe" set "CLAUDE_CODE_GIT_BASH_PATH=%ProgramFiles%\Git\bin\bash.exe"

:: Kurulum yonetici olarak yapildigi icin klasorlerin sahibi farkli olabilir;
:: git "dubious ownership" hatasi vermesin (yalnizca bu pencerede gecerli).
set "GIT_CONFIG_COUNT=1"
set "GIT_CONFIG_KEY_0=safe.directory"
set "GIT_CONFIG_VALUE_0=*"

cls
echo.
echo  ==========================================
echo       A3I - Akademik Asistan AI
echo  ==========================================
echo.

:: -- Kurulum kontrolu ----------------------------------------------
if not exist "%SCRIPT_DIR%backend\node_modules" (
  echo  [HATA] Kurulum bulunamadi. Once kurulum.bat calistirin.
  goto FAIL
)
where node >nul 2>&1
if errorlevel 1 (
  echo  [HATA] Node.js bulunamadi. Once kurulum.bat calistirin.
  goto FAIL
)
where claude >nul 2>&1
if errorlevel 1 (
  echo  [HATA] Claude Code bulunamadi. Once kurulum.bat calistirin.
  goto FAIL
)
set "HAS_GIT=1"
where git >nul 2>&1
if errorlevel 1 set "HAS_GIT="

:: Guncellemeden sonra yeni surum bu argumanla yeniden baslatilir.
if /i "%~1"=="--guncellendi" goto POST_UPDATE

:: -- A3I guncelleme kontrolu ---------------------------------------
if not defined HAS_GIT goto SKILLS
if not exist "%REPO_DIR%\.git" goto SKILLS

echo  A3I guncellemeleri kontrol ediliyor...
set "OLD_COMMIT="
set "NEW_COMMIT="
for /f "delims=" %%h in ('git -C "%REPO_DIR%" rev-parse HEAD 2^>nul') do set "OLD_COMMIT=%%h"
git -C "%REPO_DIR%" fetch --quiet >nul 2>&1
for /f "delims=" %%h in ('git -C "%REPO_DIR%" rev-parse @{u} 2^>nul') do set "NEW_COMMIT=%%h"

if not defined OLD_COMMIT goto SKILLS
if not defined NEW_COMMIT goto SKILLS
if "%OLD_COMMIT%"=="%NEW_COMMIT%" (
  echo  A3I guncel.
  goto SKILLS
)

echo  Yeni guncelleme bulundu, indiriliyor...
:: git pull bu dosyanin kendisini de degistirebilir. cmd calisan batch
:: dosyasini satir satir okudugu icin degisen dosyadan okumaya devam etmek
:: bozuk komutlar calistirir. Bu yuzden pull ve yeniden baslatma tek bir
:: parantez blogunda (onceden okunmus) yapilir ve yeni surume gecilir.
(
  git -C "%REPO_DIR%" pull --ff-only --quiet
  "%~f0" --guncellendi %OLD_COMMIT%
)

:POST_UPDATE
set "OLD_COMMIT=%~2"
set "CUR_COMMIT="
for /f "delims=" %%h in ('git -C "%REPO_DIR%" rev-parse HEAD 2^>nul') do set "CUR_COMMIT=%%h"
if "%CUR_COMMIT%"=="%OLD_COMMIT%" (
  echo  [UYARI] Guncelleme uygulanamadi ^(yerel degisiklikler olabilir^). Mevcut surumle devam ediliyor.
  goto SKILLS
)
set "KURULUM_CHANGED="
if defined OLD_COMMIT for /f "delims=" %%f in ('git -C "%REPO_DIR%" diff --name-only %OLD_COMMIT% HEAD 2^>nul ^| findstr /i /c:"Windows/kurulum.bat"') do set "KURULUM_CHANGED=1"
if defined KURULUM_CHANGED (
  echo  Kurulum guncellendi, yeniden kuruluyor...
  call "%SCRIPT_DIR%kurulum.bat"
)
echo  Bagimliliklar guncelleniyor...
pushd "%SCRIPT_DIR%backend"
call npm install --silent --no-fund --no-audit
popd
echo  A3I guncellendi.

:: -- Skills guncelle -----------------------------------------------
:SKILLS
if not defined HAS_GIT (
  echo  [UYARI] Git bulunamadi, skill guncellemesi atlandi.
  goto SKILLS_DONE
)
if exist "%SKILLS_DIR%\.git" (
  echo  Skills guncelleniyor...
  git -C "%SKILLS_DIR%" pull --ff-only --quiet >nul 2>&1
  echo  Skills guncel.
  goto SKILLS_DONE
)
echo  Skills indiriliyor...
if not exist "%SCRIPT_DIR%skills" mkdir "%SCRIPT_DIR%skills"
git clone --quiet https://github.com/Imbad0202/academic-research-skills.git "%SKILLS_DIR%"
if exist "%SKILLS_DIR%\.git" (
  echo  Skills indirildi.
) else (
  echo  [UYARI] Skills indirilemedi.
)
:SKILLS_DONE

:: -- Claude oturumu yenile -----------------------------------------
:: claude, npm ile kurulduysa bir .cmd dosyasidir; CALL olmadan cagrilirsa
:: bu betik orada biter.
echo  Claude oturumu yenileniyor...
call claude auth logout >nul 2>&1
call claude auth login
echo  Oturum yenilendi.

:: Bu ayarlar sunucuya ve Claude'a aktarilmasin.
set "GIT_CONFIG_COUNT="
set "GIT_CONFIG_KEY_0="
set "GIT_CONFIG_VALUE_0="

:: -- Onceki oturumu kapat ------------------------------------------
:: Port'u dinleyen eski A3I sunucusu kapatilir. Port baska bir program
:: tarafindan kullaniliyorsa ona dokunulmaz, uyari verilir.
call :STOP_SERVER
if errorlevel 1 (
  echo.
  echo  [HATA] %PORT% portu baska bir program tarafindan kullaniliyor.
  echo  O programi kapatip baslat.bat'i yeniden calistirin.
  goto FAIL
)

:: -- Backend baslat ------------------------------------------------
echo  Sunucu baslatiliyor...
start "" /b node "%SCRIPT_DIR%backend\server.js"

:: Hazir olmasini bekle (en fazla ~40 sn)
set /a TRIES=0
:WAIT_LOOP
set /a TRIES+=1
if %TRIES% GTR 40 goto SERVER_FAIL
timeout /t 1 /nobreak >nul
curl -s -f -o nul "http://127.0.0.1:%PORT%/api/health" >nul 2>&1
if errorlevel 1 goto WAIT_LOOP

echo  Sunucu hazir.
echo  Tarayici aciliyor...
start "" "http://localhost:%PORT%"

echo.
echo  A3I calisiyor -- http://localhost:%PORT%
echo.
echo  ------------------------------------------
echo  Durdurmak icin bu pencereyi kapatin
echo  ya da bir tusa basin.
echo  ------------------------------------------
echo.
pause >nul
call :STOP_SERVER
exit /b 0

:SERVER_FAIL
echo.
echo  [HATA] Sunucu baslatilamadi. Yukaridaki hata mesajlarina bakin.
call :STOP_SERVER

:FAIL
echo.
pause
exit /b 1


:: ================================================================
::  Yardimci alt programlar
:: ================================================================

:: PORT'u dinleyen backend\server.js surecini kapatir. Port baska bir
:: program tarafindan tutuluyorsa 1 doner.
:STOP_SERVER
powershell -NoProfile -ExecutionPolicy Bypass -Command "$busy = 0; $pids = @(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); foreach ($p in $pids) { $w = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $p) -ErrorAction SilentlyContinue; if (-not $w) { continue }; if ($w.CommandLine -like '*backend\server.js*') { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } else { $busy = 1 } }; Start-Sleep -Milliseconds 500; exit $busy"
exit /b %ERRORLEVEL%
