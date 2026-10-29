# КНН трекер

Личное расписание Всеволода Спивака, группа **3426А**: сайт на телефоне и компьютере плюс напоминания в MAX.

- **Сайт:** https://xrex-collab.github.io/knn-tracker/
- **Репозиторий:** https://github.com/Xrex-collab/knn-tracker
- GitHub Pages отдаёт папку `docs/` с ветки `main`.
- Расписание взято со скриншотов таблицы КНН (29.10.2026). Новые дни добавляются загрузкой скрина и формой пары.
- GitHub Actions (`.github/workflows/notify.yml`) — утренняя сводка в 07:00 и напоминание за ~20 минут до пары в MAX. Нужны секреты `MAX_TOKEN` и `MAX_USER_ID`.

Таблицы Google / Яндекс Диск не используются.

## Локально

```bash
node scripts/serve.mjs          # http://localhost:8080
node scripts/check.mjs          # проверка 3426А на 29.10.2026
node scripts/notify.mjs --dry --now 2026-10-29T17:10
```

Настройка: [SETUP.md](SETUP.md).
