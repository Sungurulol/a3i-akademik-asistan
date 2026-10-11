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
set "REPO_URL=https://github.com/Sungurulol/a3i-akademik-asistan.git"
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
:: git hicbir zaman ekranda gorunmeyen bir kullanici adi/sifre sorusunda beklemesin.
set "GIT_TERMINAL_PROMPT=0"

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
:: Kullanici verileri (Chats, sessions, uploads, downloads) .gitignore'da
:: oldugu icin buradaki adimlar yalnizca program dosyalarini degistirir,
:: sohbetlere dokunmaz. "git clean" bilerek KULLANILMAZ.
if not defined HAS_GIT (
  echo  [UYARI] Git bulunamadi, A3I guncellemesi atlandi.
  goto SKILLS
)
:: Gelistirici kopyasi: uzerinde calisilan dosyalar ezilmesin.
if exist "%REPO_DIR%\.a3i-gelistirici" (
  echo  Gelistirici kopyasi - otomatik guncelleme kapali.
  goto SKILLS
)
set "FORCE_SYNC="
if exist "%REPO_DIR%\.git" goto UPD_FETCH

:: ZIP ile indirilmis kurulum: klasor yerinde bir git deposuna cevrilir,
:: boylece o da guncelleme alir. Yanlis bir klasoru depoya cevirmemek icin
:: once buranin gercekten A3I klasoru oldugu dogrulanir.
if not exist "%REPO_DIR%\README.tr.md" goto SKILLS
if not exist "%REPO_DIR%\Windows\baslat.bat" goto SKILLS
if not exist "%REPO_DIR%\macOS\baslat.command" goto SKILLS
echo  Otomatik guncelleme etkinlestiriliyor, ilk seferde biraz surebilir...
git -C "%REPO_DIR%" init --quiet >nul 2>&1
if errorlevel 1 goto BOOT_FAIL
git -C "%REPO_DIR%" symbolic-ref HEAD refs/heads/main >nul 2>&1
git -C "%REPO_DIR%" remote add origin "%REPO_URL%" >nul 2>&1
git -C "%REPO_DIR%" fetch --quiet origin main >nul 2>&1
if errorlevel 1 goto BOOT_FAIL
git -C "%REPO_DIR%" reset --quiet origin/main >nul 2>&1
if errorlevel 1 goto BOOT_FAIL
git -C "%REPO_DIR%" branch --quiet --set-upstream-to=origin/main main >nul 2>&1
set "FORCE_SYNC=1"
goto UPD_COMPARE

:BOOT_FAIL
:: .git az once olusturuldu; sonraki acilista yeniden denenir.
if exist "%REPO_DIR%\.git" rmdir /s /q "%REPO_DIR%\.git" 2>nul
echo  [UYARI] Otomatik guncelleme etkinlestirilemedi. Internet baglantinizi kontrol edin.
echo  Mevcut surumle devam ediliyor.
goto SKILLS

:UPD_FETCH
echo  A3I guncellemeleri kontrol ediliyor...
git -C "%REPO_DIR%" fetch --quiet >nul 2>&1
if errorlevel 1 (
  echo  [UYARI] Guncelleme kontrol edilemedi. Mevcut surumle devam ediliyor.
  goto SKILLS
)

:UPD_COMPARE
set "OLD_COMMIT="
set "NEW_COMMIT="
for /f "delims=" %%h in ('git -C "%REPO_DIR%" rev-parse --verify -q HEAD 2^>nul') do set "OLD_COMMIT=%%h"
for /f "delims=" %%h in ('git -C "%REPO_DIR%" rev-parse --verify -q @{u} 2^>nul') do set "NEW_COMMIT=%%h"
if not defined NEW_COMMIT for /f "delims=" %%h in ('git -C "%REPO_DIR%" rev-parse --verify -q origin/main 2^>nul') do set "NEW_COMMIT=%%h"
if not defined OLD_COMMIT goto SKILLS
if not defined NEW_COMMIT goto SKILLS
set "DIRTY="
for /f "delims=" %%s in ('git -C "%REPO_DIR%" status --porcelain -uno 2^>nul') do set "DIRTY=1"

if not defined FORCE_SYNC goto UPD_ANCESTOR
:: ZIP'ten gelen dosyalar son surumle ayniysa yapilacak is yok.
if defined DIRTY goto UPD_APPLY
echo  A3I guncel.
goto SKILLS

:UPD_ANCESTOR
git -C "%REPO_DIR%" merge-base --is-ancestor %NEW_COMMIT% %OLD_COMMIT% >nul 2>&1
if not errorlevel 1 (
  echo  A3I guncel.
  goto SKILLS
)

:UPD_APPLY
echo  Yeni guncelleme bulundu, indiriliyor...
set "KUR=0"
git -C "%REPO_DIR%" diff --quiet %NEW_COMMIT% -- Windows/kurulum.bat >nul 2>&1
if errorlevel 1 set "KUR=1"
if defined DIRTY if not defined FORCE_SYNC echo  [UYARI] Yerel degisiklikler yedeklendi: git stash
:: Elle degistirilmis dosyalar guncellemeyi engellemesin: degisiklikler
:: git stash'e yedeklenir, sonra son surume gecilir.
:: Bu adimlar bu dosyanin kendisini de degistirebilir. cmd calisan batch
:: dosyasini satir satir okudugu icin degisen dosyadan okumaya devam etmek
:: bozuk komutlar calistirir. Bu yuzden hepsi ve yeniden baslatma tek bir
:: parantez blogunda (onceden okunmus) yapilir ve yeni surume gecilir.
(
  git -C "%REPO_DIR%" -c user.name=A3I -c user.email=a3i@localhost stash push --quiet >nul 2>&1
  git -C "%REPO_DIR%" reset --hard --quiet %NEW_COMMIT% >nul 2>&1
  "%~f0" --guncellendi %NEW_COMMIT% %KUR%
)

:POST_UPDATE
:: Arguman bicimi: --guncellendi YENI_COMMIT KUR
:: v3.0.4 ve oncesi baslaticilar yalnizca ESKI_COMMIT verir; o durumda
:: guncellemeyi eski baslatici yapmistir (POST_LEGACY).
if "%~3"=="" goto POST_LEGACY
set "NEW_COMMIT=%~2"
set "KUR=%~3"
set "CUR_COMMIT="
for /f "delims=" %%h in ('git -C "%REPO_DIR%" rev-parse HEAD 2^>nul') do set "CUR_COMMIT=%%h"
if not "%CUR_COMMIT%"=="%NEW_COMMIT%" (
  echo  [UYARI] Guncelleme uygulanamadi. Mevcut surumle devam ediliyor.
  goto SKILLS
)
goto POST_DEPS

:POST_LEGACY
set "OLD_COMMIT=%~2"
set "CUR_COMMIT="
for /f "delims=" %%h in ('git -C "%REPO_DIR%" rev-parse HEAD 2^>nul') do set "CUR_COMMIT=%%h"
if "%CUR_COMMIT%"=="%OLD_COMMIT%" (
  echo  [UYARI] Guncelleme uygulanamadi. Mevcut surumle devam ediliyor.
  goto SKILLS
)
set "KUR=0"
if defined OLD_COMMIT git -C "%REPO_DIR%" diff --quiet %OLD_COMMIT% HEAD -- Windows/kurulum.bat >nul 2>&1
if errorlevel 1 set "KUR=1"

:POST_DEPS
if "%KUR%"=="1" (
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
git clone --progress https://github.com/Imbad0202/academic-research-skills.git "%SKILLS_DIR%"
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
