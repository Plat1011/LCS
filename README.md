# LCS visualizer via Suffix Automaton

Небольшое веб-приложение на Flask + JS, показывающее:

- построение суффиксного автомата для строки `A`;
- поиск наибольшей общей подстроки (LCS) со строкой `B`;
- пошаговый проход по `B` с подсветкой активного состояния автомата.

## Запуск

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Откройте: http://127.0.0.1:5000

## API

- `POST /api/build` `{ "source": "..." }` — возвращает граф автомата.
- `POST /api/lcs` `{ "source": "...", "target": "..." }` — возвращает LCS и шаги прохода.
