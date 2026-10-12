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

if not exist node_modules (
  echo [Juk] Устанавливаю зависимости...
  call npm install --no-audit --no-fund || (echo [Juk] npm install завершился с ошибкой & pause & exit /b 1)
) else (
  git diff --quiet ORIG_HEAD HEAD -- package-lock.json package.json 2>nul || (
    echo [Juk] Обновляю зависимости...
    call npm install --no-audit --no-fund
  )
)

echo [Juk] Запускаю браузер...
call npm start
