# Диагностика доступности сайтов

Фронтенд-приложение на Vue 3 (Vite + TypeScript) для проверки доступности доменов с текущего устройства. Полезно в условиях, когда часть ресурсов может быть заблокирована или недоступна (например, в РФ). **Приложение только для диагностики, не для обхода блокировок.**

## Возможности

- **Статусы:** ✅ всё ок | ⚠️ частично не ок | ❌ нет интернета / DNS сломан
- Загрузка списков доменов из [itdoginfo/allow-domains](https://github.com/itdoginfo/allow-domains) (RAW) или по своей ссылке
- Проверка через загрузку ресурсов как `Image()` (без CORS): favicon.ico и fallback (apple-touch-icon)
- Контрольные проверки: wikipedia.org (с favicon), raw.githubusercontent.com
- Пул параллельных проверок (concurrency 10–20), Stop и прогресс
- Опционально: колонка RKN по снапшоту `rkn_snapshot.json`

## Требования

- Node.js 18+
- npm или pnpm

## Локальный запуск

```bash
npm i
npm run dev
```

Откройте в браузере адрес из вывода (обычно http://localhost:5173).

## Сборка

```bash
npm run build
```

Артефакты в каталоге `dist/` (статичные файлы).

## Деплой на static hosting

Собранное приложение — обычный SPA. Раздавайте содержимое `dist/` как статику.

- **Nginx:** укажите `root` на каталог с `dist/`, для SPA добавьте `try_files $uri $uri/ /index.html;` для `location /`.
- **Vercel / Netlify:** подключите репозиторий, в настройках сборки укажите `npm run build`, корень публикации — `dist` (или по документации сервиса).
- **Любой хостинг с Node:** можно поднять `vite preview` (или раздавать `dist` через express/nginx).

Приложение не требует серверного API и работает полностью в браузере.

### GitHub Pages

Да, приложение можно развернуть на GitHub Pages. В конфиге Vite задано `base: './'`, поэтому оно корректно работает и с корня домена, и из подпапки (например, `https://username.github.io/check_sites/`).

**Вариант 1: публикация из ветки (например, `gh-pages`)**

1. Соберите проект: `npm run build`.
2. В настройках репозитория: **Settings → Pages → Build and deployment → Source** выберите **Deploy from a branch**.
3. В ветке для публикации (например, `gh-pages`) в корне должны лежать файлы из каталога `dist/` (то есть `index.html`, папка `assets/`, при необходимости `default_domains.txt`, `rkn_snapshot.json` и т.д.).
4. Укажите эту ветку и папку `/ (root)` (или каталог, куда вы положили содержимое `dist/`), сохраните. Через некоторое время сайт будет доступен по адресу вида `https://<username>.github.io/<repo>/` (или по корню, если репозиторий называется `<username>.github.io`).

**Вариант 2: GitHub Actions**

1. В корне репозитория создайте каталог `.github/workflows`.
2. Добавьте файл `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - id: deploy
        uses: actions/deploy-pages@v4
```

3. В настройках репозитория: **Settings → Pages → Build and deployment → Source** выберите **GitHub Actions**.
4. При каждом пуше в ветку `main` будет выполняться сборка и деплой; сайт появится по адресу `https://<username>.github.io/<repo>/`.

Файлы из `public/` (в том числе `default_domains.txt`, `rkn_snapshot.json`) при сборке копируются в `dist/` и будут доступны на GitHub Pages.

## Источники доменов

- В выпадающем списке — пресеты из репозитория itdoginfo/allow-domains (Russia inside/outside RAW, Services: YouTube, Discord, Meta, Telegram, Tik-Tok, Twitter, HDRezka).
- Режим **Custom URL** — вставьте ссылку на raw-файл со списком доменов (по одному на строку).
- Если загрузка списков не удалась (например, GitHub недоступен), используется локальный список из `public/default_domains.txt` (или встроенный fallback ~30 доменов).

## Ограничения метода проверки

- Проверка **только через загрузку изображений** (`Image()`): сначала `https://{domain}/favicon.ico`, при неудаче — `https://{domain}/apple-touch-icon.png`. Iframe не используется: при блокировке или редиректе на страницу блокировки iframe всё равно получает «load», из-за чего заблокированные сайты ошибочно помечались бы как OK.
- Заблокированный или недоступный домен не отдаёт картинку → корректно получаем FAIL/TIMEOUT.
- У части сайтов нет favicon и нет apple-touch-icon — такие домены будут помечены как FAIL даже при доступности в браузере.
- Рекомендуется интерпретировать результат как «доступность с текущего устройства», а не как гарантию наличия/отсутствия блокировки на уровне РКН.

## RKN-снапшот (опционально)

Если нужна колонка «в списке РКН: да/нет», приложение может подгрузить локальный снапшот.

### Формат `rkn_snapshot.json`

Положите файл в **корень публикации** рядом со статикой (например, в `public/` до сборки — тогда он окажется в корне `dist/`):

```json
{
  "domains": ["blocked.example.org"],
  "updatedAt": "2025-02-28T12:00:00.000Z"
}
```

- `domains` — массив строк (домены из реестра/списка).
- `updatedAt` — дата обновления снапшота (любая строка, для отображения).

Если файла нет или в нём пустой `domains`, колонка RKN не показывается или отображается как «unknown» и выводится подсказка, как добавить снапшот.

### Как получить снапшот

1. **Вручную:** собрать список доменов из открытых источников и сохранить в `public/rkn_snapshot.json`, затем пересобрать/загрузить сайт.
2. **CI/скрипт:** вне фронта (отдельный скрипт или job в CI) периодически формировать `rkn_snapshot.json` и класть его в каталог статики или в `public/` перед сборкой. Реализация скрипта/сервиса не входит в этот репозиторий.

## Лицензия

MIT (если не указано иное в репозитории).
