# Telegram bot (aiogram)

Минимальный бот на Python с кнопкой. При нажатии сохраняет информацию о пользователе
в JSON-файл базы данных.

## Быстрый старт

1. Установить зависимости.
2. Задать переменную окружения `BOT_TOKEN`.
3. Запустить бота.

## Пример (PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

$env:BOT_TOKEN="ВАШ_ТОКЕН"
python .\bot\main.py
```

Данные сохраняются в `database/users.json`.
