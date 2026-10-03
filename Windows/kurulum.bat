@echo off
setlocal EnableExtensions
chcp 65001 >nul
title A3I - Akademik Asistan AI Kurulum

:: Not: Bu dosya bilerek yalnizca ASCII karakter icerir ve CRLF satir sonu
:: kullanir. cmd.exe UTF-8 / LF batch dosyalarinda GOTO ve satir okuma
:: hatalari yapabiliyor.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "CHOCO_BIN=%ALLUSERSPROFILE%\chocolatey\bin"
set "CLAUDE_BIN=%USERPROFILE%\.local\bin"

:: Yonetici olarak klonlanan klasorlerde git "dubious ownership" hatasi
:: vermesin (komut kapsaminda gecerli, global ayar degistirilmez).
set "GIT_CONFIG_COUNT=1"
set "GIT_CONFIG_KEY_0=safe.directory"
set "GIT_CONFIG_VALUE_0=*"

:: -- Yonetici yetkisi --------------------------------------------
:: Chocolatey yonetici ister. Yetki yoksa ayni dosyayi yonetici olarak
:: yeniden acar ve bitmesini bekler.
fltmc >nul 2>&1
if not errorlevel 1 goto IS_ADMIN
if /i "%~1"=="--yonetici" goto IS_ADMIN
echo.
echo  Yonetici izni isteniyor...
set "A3I_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath $env:A3I_SELF -ArgumentList '--yonetici' -Verb RunAs -Wait -ErrorAction Stop; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo.
  echo  [HATA] Yonetici izni verilmedi.
  echo  kurulum.bat dosyasina sag tiklayip "Yonetici olarak calistir" secin.
  echo.
  pause
  exit /b 1
)
exit /b 0
:IS_ADMIN

echo.
echo  ==========================================
echo       A3I - Akademik Asistan AI
echo       Windows Kurulum
echo  ==========================================
echo.
echo  Internet baglantisi gereklidir.
echo  Yaklasik 5-10 dakika surebilir.
echo.
pause

call :REFRESH_PATH

:: -- 1. Chocolatey ------------------------------------------------
echo.
echo  [1/8] Chocolatey kontrol ediliyor...
where choco >nul 2>&1
if not errorlevel 1 goto CHOCO_OK
if exist "%CHOCO_BIN%\choco.exe" goto CHOCO_OK
echo  Chocolatey kuruluyor...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
:CHOCO_OK
:: Chocolatey ayri bir PowerShell surecinde kuruldugu icin bu pencerenin
:: PATH'i guncel degil; elle eklenir.
call :REFRESH_PATH
where choco >nul 2>&1
if errorlevel 1 (
  set "FAIL_MSG=Chocolatey kurulamadi."
  goto FAIL
)
echo  Chocolatey hazir.

:: -- 2. Git --------------------------------------------------------
:: Skill dosyalari git ile indirilir; Claude Code da Windows'ta Git for
:: Windows (Git Bash) ister.
echo.
echo  [2/8] Git kontrol ediliyor...
where git >nul 2>&1
if not errorlevel 1 goto GIT_OK
echo  Git kuruluyor...
choco install git -y --no-progress
call :REFRESH_PATH
where git >nul 2>&1
if errorlevel 1 (
  set "FAIL_MSG=Git kurulamadi."
  goto FAIL
)
:GIT_OK
echo  Git hazir.

:: -- 3. Node.js (18+) ----------------------------------------------
echo.
echo  [3/8] Node.js kontrol ediliyor...
call :NODE_CHECK
if not errorlevel 1 goto NODE_OK
echo  Node.js kuruluyor / guncelleniyor...
choco upgrade nodejs-lts -y --no-progress
call :REFRESH_PATH
call :NODE_CHECK
if errorlevel 1 (
  set "FAIL_MSG=Node.js 18 veya ustu kurulamadi."
  goto FAIL
)
:NODE_OK
for /f "delims=" %%v in ('node --version') do echo  Node.js hazir ^(%%v^).

:: -- 4. Python (3.10+) ---------------------------------------------
:: "where python" yeterli degil: Windows 10/11'deki Microsoft Store
:: kisayolu (WindowsApps\python.exe) Python kurulu olmasa da bulunur.
echo.
echo  [4/8] Python kontrol ediliyor...
call :PY_CHECK
if defined PY goto PY_OK
echo  Python kuruluyor...
choco install python313 -y --no-progress
call :REFRESH_PATH
call :PY_CHECK
if defined PY goto PY_OK
echo  [UYARI] Python kurulamadi. Word/Excel/PowerPoint dosyasi yukleme calismayabilir.
goto PY_DONE
:PY_OK
echo  Python hazir.
echo  MarkItDown kuruluyor (dosya isleme icin)...
:: Uygulamaya ozel sanal ortam: kullanici profilinden ve PATH'ten bagimsiz.
set "VENV_PY=%SCRIPT_DIR%.venv\Scripts\python.exe"
if not exist "%VENV_PY%" %PY% -m venv "%SCRIPT_DIR%.venv"
if not exist "%VENV_PY%" goto MD_USER
"%VENV_PY%" -m pip install --upgrade --quiet --disable-pip-version-check "markitdown[pdf,docx,pptx,xlsx]"
if errorlevel 1 goto MD_USER
echo  MarkItDown hazir.
goto PY_DONE
:MD_USER
:: Sanal ortam olmazsa kullanici klasorune kurulur.
%PY% -m pip install --user --upgrade --quiet --no-warn-script-location "markitdown[pdf,docx,pptx,xlsx]"
if errorlevel 1 (
  echo  [UYARI] MarkItDown kurulamadi. Word/Excel/PowerPoint dosyasi yukleme calismayabilir.
) else (
  echo  MarkItDown hazir.
)
:PY_DONE

:: -- 5. Java (11+, PDF isleme icin) --------------------------------
:: "java --version" yalnizca Java 9+ surumlerinde calisir; Java 8 varsa
:: yenisi kurulur.
echo.
echo  [5/8] Java kontrol ediliyor...
java --version >nul 2>&1
if not errorlevel 1 goto JAVA_OK
echo  Java kuruluyor...
choco install openjdk -y --no-progress
call :REFRESH_PATH
java --version >nul 2>&1
if not errorlevel 1 goto JAVA_OK
echo  [UYARI] Java kurulamadi. PDF yukleme calismayacak.
goto JAVA_DONE
:JAVA_OK
echo  Java hazir.
:JAVA_DONE

:: -- 6. Claude Code ------------------------------------------------
:: Resmi Windows kurulumu claude.exe kurar (%USERPROFILE%\.local\bin).
:: Olmazsa npm ile kurulur.
echo.
echo  [6/8] Claude Code kontrol ediliyor...
where claude >nul 2>&1
if not errorlevel 1 goto CLAUDE_OK
echo  Claude Code kuruluyor...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"
call :REFRESH_PATH
where claude >nul 2>&1
if not errorlevel 1 goto CLAUDE_OK
echo  Resmi kurulum basarisiz, npm ile deneniyor...
call npm install -g @anthropic-ai/claude-code
call :REFRESH_PATH
where claude >nul 2>&1
if errorlevel 1 (
  set "FAIL_MSG=Claude Code kurulamadi."
  goto FAIL
)
:CLAUDE_OK
:: claude.exe'nin klasoru kalici kullanici PATH'inde yoksa eklenir.
if exist "%CLAUDE_BIN%\claude.exe" powershell -NoProfile -ExecutionPolicy Bypass -Command "$d = Join-Path $env:USERPROFILE '.local\bin'; $p = [string][Environment]::GetEnvironmentVariable('Path','User'); if (($p -split ';') -notcontains $d) { [Environment]::SetEnvironmentVariable('Path', (($p.TrimEnd(';') + ';' + $d).TrimStart(';')), 'User') }"
echo  Claude Code hazir.

:: -- 7. Backend paketleri ------------------------------------------
:: npm bir .cmd dosyasidir; CALL olmadan cagrilirsa bu betik orada biter.
echo.
echo  [7/8] Backend paketleri kuruluyor...
pushd "%SCRIPT_DIR%backend"
call npm install --no-fund --no-audit
set "NPM_ERR=%ERRORLEVEL%"
popd
if not "%NPM_ERR%"=="0" (
  set "FAIL_MSG=Backend paketleri kurulamadi (npm install)."
  goto FAIL
)
echo  Paketler hazir.

:: -- 8. Skill dosyalari --------------------------------------------
echo.
echo  [8/8] Akademik skill dosyalari indiriliyor...
set "SKILLS_DIR=%SCRIPT_DIR%skills\academic-research-skills"
if exist "%SKILLS_DIR%\.claude" (
  echo  Skills zaten mevcut.
  goto SKILLS_OK
)
if not exist "%SCRIPT_DIR%skills" mkdir "%SCRIPT_DIR%skills"
:: Yarim kalmis bir onceki indirme varsa temizlenir.
if exist "%SKILLS_DIR%" rmdir /s /q "%SKILLS_DIR%"
git clone --quiet https://github.com/Imbad0202/academic-research-skills.git "%SKILLS_DIR%"
if not exist "%SKILLS_DIR%\.claude" (
  set "FAIL_MSG=Skill dosyalari indirilemedi."
  goto FAIL
)
echo  Skills indirildi.
:SKILLS_OK

:: Ek skill: grad-grounded-theory
if exist "%SKILLS_DIR%\grad-grounded-theory" goto SKIP_GRAD_SKILL
echo  grad-grounded-theory skill indiriliyor...
set "TMP_SKILLS_DIR=%TEMP%\asgard-skills-%RANDOM%"
git clone --depth 1 --quiet https://github.com/asgard-ai-platform/skills.git "%TMP_SKILLS_DIR%"
if not exist "%TMP_SKILLS_DIR%\grad-grounded-theory" (
  echo  [UYARI] grad-grounded-theory skill indirilemedi.
  goto CLEANUP_GRAD_SKILL
)
xcopy /e /i /y /q "%TMP_SKILLS_DIR%\grad-grounded-theory" "%SKILLS_DIR%\grad-grounded-theory" >nul
echo  grad-grounded-theory skill indirildi.
:CLEANUP_GRAD_SKILL
if exist "%TMP_SKILLS_DIR%" rmdir /s /q "%TMP_SKILLS_DIR%" 2>nul
:SKIP_GRAD_SKILL

:: Ek skill: academic-pptx-skill
if exist "%SKILLS_DIR%\academic-pptx-skill" goto SKIP_PPTX_SKILL
echo  academic-pptx-skill indiriliyor...
set "TMP_PPTX_DIR=%TEMP%\academic-pptx-%RANDOM%"
git clone --depth 1 --quiet https://github.com/Gabberflast/academic-pptx-skill.git "%TMP_PPTX_DIR%"
if not exist "%TMP_PPTX_DIR%\SKILL.md" (
  echo  [UYARI] academic-pptx-skill indirilemedi.
  goto CLEANUP_PPTX_SKILL
)
if exist "%TMP_PPTX_DIR%\.git" rmdir /s /q "%TMP_PPTX_DIR%\.git" 2>nul
xcopy /e /i /y /q "%TMP_PPTX_DIR%" "%SKILLS_DIR%\academic-pptx-skill" >nul
echo  academic-pptx-skill indirildi.
:CLEANUP_PPTX_SKILL
if exist "%TMP_PPTX_DIR%" rmdir /s /q "%TMP_PPTX_DIR%" 2>nul
:SKIP_PPTX_SKILL

:: -- Claude oturumu ------------------------------------------------
echo.
call claude auth status >nul 2>&1
if not errorlevel 1 (
  echo  Claude oturumu zaten acik.
  goto AUTH_OK
)
echo  Claude hesabiniza giris yapilacak.
echo  Tarayici acilacak - Anthropic hesabinizla giris yapin.
echo.
pause
call claude auth login
:AUTH_OK

echo.
echo  ==========================================
echo         Kurulum Tamamlandi!
echo  ==========================================
echo.
echo  Kullanmak icin: baslat.bat dosyasina cift tiklayin.
echo.
pause
exit /b 0


:: ================================================================
::  Yardimci alt programlar
:: ================================================================

:: PATH'i kayit defterinden yeniler (yeni kurulan programlar gorunsun) ve
:: Chocolatey / Claude / npm klasorlerini ekler.
:REFRESH_PATH
if exist "%CHOCO_BIN%\RefreshEnv.cmd" call "%CHOCO_BIN%\RefreshEnv.cmd" >nul 2>&1
set "PATH=%PATH%;%CHOCO_BIN%;%CLAUDE_BIN%;%APPDATA%\npm"
exit /b 0

:: Node.js 18+ varsa 0, yoksa 1 doner.
:NODE_CHECK
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" >nul 2>&1
exit /b %ERRORLEVEL%

:: Calisan bir Python 3.10+ bulursa PY degiskenini ayarlar.
:PY_CHECK
set "PY="
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if not errorlevel 1 (
  set "PY=python"
  exit /b 0
)
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if not errorlevel 1 set "PY=py -3"
exit /b 0

:FAIL
echo.
echo  [HATA] %FAIL_MSG%
echo  Yukaridaki mesajlari kontrol edip kurulum.bat'i yeniden calistirin.
echo.
pause
exit /b 1
