@echo off
rem Juk Browser: скачать последнюю версию ветки dev с GitHub и запустить.
rem ВНИМАНИЕ: локальные правки файлов в этой папке будут перезаписаны версией с GitHub.
chcp 65001 >nul
cd /d "%~dp0"

echo [Juk] Закрываю запущенный браузер...
powershell -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\node_modules\electron\*' } | Stop-Process -Force"

echo [Juk] Скачиваю обновления с GitHub...
git fetch origin || (echo [Juk] Не удалось выполнить git fetch & pause & exit /b 1)
git checkout -f -B dev origin/dev || (echo [Juk] Не удалось переключиться на ветку dev & pause & exit /b 1)

for /f %%i in ('git rev-parse HEAD:package-lock.json') do set NEWLOCK=%%i
set OLDLOCK=
if exist node_modules\.juk-lock set /p OLDLOCK=<node_modules\.juk-lock
set NEED=
if not exist node_modules\electron set NEED=1
if not "%OLDLOCK%"=="%NEWLOCK%" set NEED=1
if defined NEED (
  echo [Juk] Устанавливаю или обновляю зависимости...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [Juk] npm install завершился с ошибкой
    pause
    exit /b 1
  )
  >node_modules\.juk-lock echo %NEWLOCK%
)

echo [Juk] Запускаю браузер...
call npm start
