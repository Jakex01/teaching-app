# Teaching App 🎨

A tutoring app with a persistent whiteboard for every student. Where it's headed: [ROADMAP.md](ROADMAP.md). Technology choices: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Status:** Stage 1. Done: monorepo + Next.js (A2), the teacher panel (students, lessons, dashboard) on a real Postgres database, and **student mode** (personal sign-in links, a student's own page and notebook-board, signed board tickets). Real teacher login comes next.

## Run it

You need [Node.js](https://nodejs.org) 20.9 or newer. Install everything once:

```bash
cd ~/Desktop/teaching-app
npm install
```

**While coding**, run the web app and the sync server together, with live reload:

```bash
npm run dev
```

Then open **http://localhost:3000/panel** for the teacher panel, or http://localhost:3000/board for a blank whiteboard.

`npm run dev` first updates the local database and adds example data (3 students with lessons) on the first run.

**Production build**, run locally:

```bash
npm run build
npm start
```

| Command | What it does |
|---|---|
| `npm run dev` | Web app on :3000 + sync server on :3001, both reload on save |
| `npm run build` | Production build of the web app |
| `npm start` | Runs the production build + sync server |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check of every package |
| `npm run db:generate` | Creates a migration after you change `packages/db/src/schema.ts` |
| `npm run db:migrate` | Applies migrations to the local database |
| `npm run db:seed` | Adds the dev teacher and example data (safe to repeat) |

CI (GitHub Actions) runs typecheck, tests and build on every push: [.github/workflows/ci.yml](.github/workflows/ci.yml).

- **Invite someone:** click **Invite** to copy the room link.
- **New board:** open `/board` without `?room=`. You get a fresh room name, like `sunny-otter-42`.
- **Where boards are saved:** `apps/sync/data/<room>.json`. Boards survive a restart.
- **Where panel data is saved:** `.data/pglite`, a real Postgres ([PGlite](https://pglite.dev)) stored on disk. Delete the folder to start fresh. Later this becomes Supabase Postgres, with the same schema.
- **One process at a time:** PGlite can't be opened by two processes. Stop `npm run dev` before running `npm run db:migrate` or `db:seed`. A lock file (`.data/pglite.lock`) enforces this.

## Teacher panel

`/panel`, in Polish. For now you're automatically signed in as the dev teacher "Kuba" (`npm run dev` only). In a production build the panel sends you to `/logowanie` until real login exists.

- **Pulpit:** today's lessons, the next few days, students, and weekly numbers.
- **Uczniowie:** student cards. Each student has notes (level, goal, private notes) and a notebook-board that opens with one click.
- **Lekcje:** the next 3 weeks grouped by day. Plan a lesson with a date, length, topic and video link (https only). Mark it as done or cancelled, or bring it back.

Every query and action filters by the signed-in teacher's id, and every form is validated with zod on the server.

## Student mode

1. On a student's page in the panel, the teacher clicks **Utwórz link dla ucznia** and sends the link to the student (or a parent). The link is shown only once, and only its SHA-256 hash is stored.
2. The student opens `/uczen/wejdz/<token>`. That sets a signed, httpOnly cookie and redirects to **`/uczen`**, so the token doesn't stay in the address bar.
3. `/uczen` shows the student's notebook, the next lesson (with **Dołącz do wideo** from 15 minutes before the start), upcoming lessons and recently covered topics. It never shows teacher notes or other students.
4. **Mój zeszyt** (`/uczen/tablica`) opens the student's notebook-board. The teacher opens the same board from the panel (`/panel/zeszyt/<studentId>`) and gets Spotlight and Clear.
5. **Nowy link** replaces the old link, and **Wyłącz dostęp** turns access off. Either way the old link and existing sessions stop working on the next request.

**How the board knows who you are:** the web app signs a *ticket* (room, name, role, colour, expiry) with `SYNC_SECRET`, and the sync server checks it. Notebook rooms (`b-…`) can't be joined without a valid ticket, so a student can't pretend to be the teacher or open someone else's notebook. Open demo boards at `/board` still work without one.

**Images:** the browser scales a pasted image down to 2048 px and re-encodes it as WebP (which also removes photo metadata such as GPS location). It uploads it once to `POST /api/assets` with the board ticket, and only the file's address goes on the board. The server checks the real file type from its first bytes (PNG, JPEG, WebP and GIF only; no SVG) and limits files to 5 MB, 20 uploads a minute and 300 images per notebook. `GET /api/assets/<room>/<file>` serves an image only to that notebook's teacher or student, with `nosniff` and a locked-down CSP. The sync server also refuses image elements that point at another notebook's files. Files are stored in `apps/web/.data/assets` (later Supabase Storage). Deleting an image from the board doesn't delete the file yet.

Known limit: a ticket is valid for 8 hours, so a student who is already inside a board stays connected after **Wyłącz dostęp** until they leave the page. Parent consent for students under 16 (task B7) isn't built yet.

### Settings

| Where | Variable | Default | Meaning |
|---|---|---|---|
| `apps/web` | `SYNC_PUBLIC_URL` | `ws://localhost:3001/ws` | Sync server address, as the browser sees it |
| `apps/sync` | `PORT` | `3001` | Sync server port |
| `apps/sync` | `ALLOWED_ORIGINS` | `http://localhost:3000` | Web app addresses allowed to connect, comma separated |
| `apps/sync` | `DATA_DIR` | `apps/sync/data` | Where boards are saved |
| both | `SYNC_SECRET` | dev value in `npm run dev` | Signs board tickets. **Required** in production, and must be the same in web and sync |
| `apps/web` | `SESSION_SECRET` | dev value in `npm run dev` | Signs the student session cookie. **Required** in production |

Generate secrets with `openssl rand -base64 32`. See `apps/web/.env.example`.

To test on other devices on the same Wi-Fi, use the computer's address, for example:

```bash
SYNC_PUBLIC_URL=ws://192.168.1.20:3001/ws ALLOWED_ORIGINS=http://192.168.1.20:3000 npm run dev
```

## Project layout

```
apps/
  web/                 Next.js app: pages, and later the API, login, payments
    app/page.tsx       Home page
    app/board/         Whiteboard page (loads @teaching/board in the browser)
    proxy.ts           Per-request Content Security Policy with a nonce
    app/globals.css    Tailwind + design tokens (bg-paper, text-ink, shadow-hard…)
    app/panel/         Teacher panel pages
    components/        UI kit (ui.tsx), forms, lesson row, navigation
    lib/               data.ts (queries), actions.ts (server actions), validation.ts, session.ts, time.ts
  sync/                Live-sync server (WebSocket), TypeScript
    src/server.ts      Connections, validation, limits, teacher-only actions
    src/rooms.ts       Boards in memory + saving to disk
    data/              Saved boards (not in git)
packages/
  db/                  Database: Drizzle schema, migrations (drizzle/), seed data
  shared/              Zod schemas and types shared by browser and server
    src/elements.ts    Board elements and limits
    src/messages.ts    Live-sync messages
  board/               The whiteboard: canvas engine + React UI
    src/board/         engine.ts (tools, undo, camera, spotlight), geometry.ts, render.ts
    src/components/    Dock, style bubble, people, join screen, toasts…
    src/styles.css     Board look & feel (colours are CSS variables at the top)
docs/ARCHITECTURE.md   Tech stack, data model, plan
```

Frontend code lives in `apps/web` and `packages/board`. Backend code lives in `apps/sync` and, later, the API routes in `apps/web`. Both sides validate with the same schemas from `packages/shared`.

## Whiteboard tools

| Key | Tool | | Key | Tool |
|---|---|---|---|---|
| V | Select / move (drag a box to select several) | | R | Rectangle |
| H | Move around (or hold **Space**, or drag with the **right mouse button**) | | O | Circle |
| P | Pen | | G | Triangle |
| M | Highlighter | | L | Line |
| E | Eraser | | A | Arrow |
| T | Text (double-click text to edit) | | | |

- **Images:** copy a picture anywhere (Ctrl/Cmd+C) and paste it on the board (Ctrl/Cmd+V), or drag an image file onto the board. Drag the corner handles to resize (proportions kept; hold **Shift** to stretch) and the yellow handle above to rotate (hold **Shift** for 15° steps). Images work in students' notebooks, not on open demo boards.
- **Shift** while drawing: perfect squares and circles, lines snap to 45°.
- **Ctrl/Cmd+Z** undo, **Ctrl/Cmd+Shift+Z** redo, **Ctrl/Cmd+D** duplicate, **Delete** remove.
- Scroll, or drag with the right (or middle) mouse button, to move around. Pinch or Ctrl+scroll to zoom. **0** fits the board on screen.
- Teachers only: **Spotlight** (everyone follows the teacher's view) and **Clear** (click twice; undo brings it back).

## Security

- **One set of rules on both sides.** The sync server and the browser validate every message with the same zod schemas from `packages/shared`: types, lengths, colours, coordinates. Anything else is dropped. Tests: `packages/shared/src/schemas.test.ts`.
- **Limits.** Messages are capped at 1 MB. A stroke can have up to 5,000 points, a text box up to 2,000 characters, a board up to 20,000 elements, and a room up to 100 people. A client that floods the server is disconnected.
- **Only our web app can connect.** The sync server checks the `Origin` header against `ALLOWED_ORIGINS`.
- **Content Security Policy with a nonce.** Only our own scripts run, and the page can only connect to itself and the sync server. Plus `nosniff`, `X-Frame-Options: DENY`, and a strict `Referrer-Policy` and `Permissions-Policy`.
- **Fonts are bundled** (`@fontsource`), so no visitor data goes to Google.
- **No HTML injection.** React escapes everything people type. The code never uses `innerHTML`.
- **Safe saving.** Room names can only contain `a-z 0-9 -`. Boards are written to a temp file and then renamed. Invalid saved elements are skipped.
- **Not verified yet: the teacher role.** Anyone can pick "Teacher". Accounts are the next part of Stage 1 (tasks B1–B7 in the architecture doc).
