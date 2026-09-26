# Teaching App 🎨

A tutoring app with a persistent whiteboard for every student. Where it's headed: [ROADMAP.md](ROADMAP.md). Technology choices: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Status:** Stage 1, task A2 is done (monorepo + Next.js). The live whiteboard works. Accounts, notebooks and pages come next.

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

Then open **http://localhost:3000** and click **Otwórz tablicę** (or go straight to http://localhost:3000/board).

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

CI (GitHub Actions) runs typecheck, tests and build on every push: [.github/workflows/ci.yml](.github/workflows/ci.yml).

- **Invite someone:** click **Invite** to copy the room link.
- **New board:** open `/board` without `?room=`. You get a fresh room name, like `sunny-otter-42`.
- **Where boards are saved:** `apps/sync/data/<room>.json`. Boards survive a restart.

### Settings

| Where | Variable | Default | Meaning |
|---|---|---|---|
| `apps/web` | `SYNC_PUBLIC_URL` | `ws://localhost:3001/ws` | Sync server address, as the browser sees it |
| `apps/sync` | `PORT` | `3001` | Sync server port |
| `apps/sync` | `ALLOWED_ORIGINS` | `http://localhost:3000` | Web app addresses allowed to connect, comma separated |
| `apps/sync` | `DATA_DIR` | `apps/sync/data` | Where boards are saved |

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
  sync/                Live-sync server (WebSocket), TypeScript
    src/server.ts      Connections, validation, limits, teacher-only actions
    src/rooms.ts       Boards in memory + saving to disk
    data/              Saved boards (not in git)
packages/
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
| H | Move around (or hold **Space**) | | O | Circle |
| P | Pen | | G | Triangle |
| M | Highlighter | | L | Line |
| E | Eraser | | A | Arrow |
| T | Text (double-click text to edit) | | | |

- **Shift** while drawing: perfect squares and circles, lines snap to 45°.
- **Ctrl/Cmd+Z** undo, **Ctrl/Cmd+Shift+Z** redo, **Ctrl/Cmd+D** duplicate, **Delete** remove.
- Scroll to move around. Pinch or Ctrl+scroll to zoom. **0** fits the board on screen.
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
