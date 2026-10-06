# Teaching App 🎨

A tutoring app with a persistent whiteboard for every student. Where it's headed: [ROADMAP.md](ROADMAP.md). Technology choices: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Status:** Stage 1. Done: monorepo + Next.js (A2), the teacher panel (students, lessons, dashboard) on a real Postgres database, and **student mode** (personal sign-in links, a student's own page and notebook-board, signed board tickets). Real teacher login comes next.

## Run it

You need [Node.js](https://nodejs.org) 20.9 or newer and [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL). Install everything once:

```bash
cd ~/Desktop/teaching-app
npm install
```

**While coding**, run the web app and the sync server together, with live reload:

```bash
npm run dev
```

Then open **http://localhost:3000/panel** for the teacher panel, or http://localhost:3000/board for a blank whiteboard.

`npm run dev` first starts PostgreSQL in Docker (`npm run db:up`), updates the database and adds example data (3 students with lessons) on the first run. Docker Desktop must be running.

**Everything in Docker**, the way it will run in the cloud (database, migrations, web, sync, all in production mode):

```bash
cp .env.example .env    # then fill in SYNC_SECRET and SESSION_SECRET (openssl rand -base64 32)
docker compose --profile app up --build
```

Open http://localhost:3000. Stop with Ctrl+C, then `docker compose --profile app down` (data stays in Docker volumes). Sign in at `/logowanie` (the development account works here too, because it's the same local database).

| Command | What it does |
|---|---|
| `npm run dev` | Web app on :3000 + sync server on :3001, both reload on save |
| `npm run build` | Production build of the web app |
| `npm start` | Runs the production build + sync server |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check of every package |
| `npm run lint` | ESLint (TypeScript, React, Next.js and security rules), no warnings allowed |
| `npm run db:generate` | Creates a migration after you change `packages/db/src/schema.ts` |
| `npm run db:migrate` | Applies migrations to the local database |
| `npm run db:seed` | Adds the dev teacher and example data (safe to repeat) |
| `npm run db:up` / `db:down` | Starts / stops PostgreSQL in Docker |
| `npm run teacher:create -- --email … --name …` | Creates a teacher account, or sets a new password for an existing one (asks for the password, hidden) |
| `npm run db:import-pglite` | One-off: copies data from the old PGlite database (`.data/pglite`) |
| `npm run db:import-boards` | One-off: copies boards from the old JSON files (`apps/sync/data`) |

CI (GitHub Actions) runs on every pull request, on `main` and weekly: [.github/workflows/ci.yml](.github/workflows/ci.yml). See **Security checks** below.

- **Invite someone:** click **Invite** to copy the room link.
- **New board:** open `/board` without `?room=`. You get a fresh room name, like `sunny-otter-42`.
- **Where everything is saved:** PostgreSQL 17 in Docker (`docker-compose.yml`, port **55432** on this computer so it doesn't clash with a Postgres already installed on 5432). Data lives in the Docker volume `teaching-app_pgdata`. To look inside: `docker compose exec db psql -U teaching`.
- **How boards are saved:** one row per element in `board_elements`. The sync server writes only what changed, at most about 1 second after the change, even while people keep drawing, and saves everything on shutdown. A failed write is retried. Tested: pen strokes survive the sync server being killed (`kill -9`).
- **Uploaded images:** `apps/web/.data/assets` (in Docker: the `assets` volume).

## Teacher panel

`/panel`, in Polish. Sign in at `/logowanie` with e-mail and password.

**Development account** (local database only, created by `npm run db:seed`): `dev-teacher@teaching.local` / `doodle-dev-password`.

- **Pulpit:** today's lessons, the next few days, students, and weekly numbers.
- **Uczniowie:** student cards. Each student has notes (level, goal, private notes) and a notebook-board that opens with one click.
- **Lekcje:** the next 3 weeks grouped by day. Plan a lesson with a date, length, topic and video link (https only). Mark it as done or cancelled, or bring it back.

Every query and action filters by the signed-in teacher's id, and every form is validated with zod on the server.

## Security checks

All free, all in CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)). Every job must pass before a pull request is merged.

| Job | What it catches | Tool |
|---|---|---|
| Lint, types, tests, build | Bugs, unsafe patterns (`innerHTML`, `eval`, unsafe regexes…), broken types | ESLint with `typescript-eslint`, `react-hooks`, Next.js, `eslint-plugin-security`, `eslint-plugin-no-unsanitized`; Vitest |
| Secrets | Passwords, keys and tokens anywhere in git history | gitleaks |
| Dependencies | Known vulnerabilities in npm packages (high and critical fail) | `npm audit`, OSV-Scanner |
| Code scan | OWASP Top 10 patterns in TypeScript/React/Next.js/Node, secrets, Dockerfile, compose and GitHub Actions mistakes | Semgrep |
| Docker | Dockerfile best practices; vulnerable OS or npm packages in the images | Hadolint, Trivy |
| Running app | Missing security headers, cookie flags, CSP, clickjacking protection… on the real stack started with Docker | OWASP ZAP baseline (rules and reviewed exceptions in [.zap/rules.tsv](.zap/rules.tsv); the report is attached to each run) |

Also:
- **Dependabot** ([.github/dependabot.yml](.github/dependabot.yml)) opens weekly pull requests for npm packages, GitHub Actions and Docker images, with a 7-day cooldown on new releases (a hijacked version that gets pulled within days never reaches us).
- Actions are pinned to commit SHAs and scanners to exact versions.
- The production images contain no npm, only `node`, and run as a non-root user (uid 1000).
- **Git hooks** (installed by `npm install`): `pre-commit` scans staged changes for secrets (gitleaks, or Docker if gitleaks isn't installed), `pre-push` refuses direct pushes to `main`.
- Reviewed lint exceptions are marked in the code with `eslint-disable-next-line <rule> -- reason`.

Run a scan locally, for example: `docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep:1.177.0 semgrep scan --config p/owasp-top-ten --exclude node_modules`.

## Login

One login page (`/logowanie`) for teachers and students. Every account has a role (`users.role`: `teacher` or `student`) and goes to `/panel` or `/uczen`. E-mail and password, stored in our own database. There's no public sign-up: teacher accounts are made with `npm run teacher:create` (on the server: `docker compose run --rm migrate node --import tsx packages/db/src/create-teacher.ts --email … --name …`). Code: `packages/db/src/passwords.ts`, `apps/web/lib/session.ts`, `apps/web/lib/auth-actions.ts`.

- **Passwords** are hashed with scrypt (N=2^17, r=8, p=1, the OWASP recommendation) with a random salt per password. The stored format includes the parameters, so they can be raised later; old hashes are upgraded at the next login.
- **Password rules** follow NIST: at least 12 characters, no forced character mixes, common passwords and ones containing the e-mail name are refused.
- **Sessions:** the cookie holds a random 256-bit token; the database stores only its SHA-256 (`sessions` table). The cookie is `HttpOnly`, `SameSite=Lax`, and in production `Secure` with the `__Host-` prefix. A session ends after 30 days without use and at most 90 days after signing in. Signing in always creates a new session; signing out deletes it.
- **Brute force:** per 15 minutes, 5 wrong passwords for one e-mail from one IP, 50 for one e-mail from anywhere, 30 attempts per IP. Wrong e-mail and wrong password get the same message and take the same time, so nobody can find out which e-mails have accounts.
- **Changing the password** (`/panel/konto`) needs the current one and signs out every other device. Forms are server actions, which Next.js protects against cross-site submissions.
- **Forgot password** (`/reset-hasla`): a one-time link by e-mail, valid for 60 minutes (only its SHA-256 is stored). The answer is the same whether or not the account exists, and the e-mail is sent in the background so the response time doesn't tell either. Setting the new password signs out every device. Limits: 10 requests per IP and 3 per e-mail per hour.
- Not yet: two-factor sign-in.

## Student mode

### Student accounts (invitation by e-mail)

1. On a student's page in the panel, the teacher enters the student's (or a parent's) e-mail under **Konto ucznia** and clicks **Wyślij zaproszenie**.
2. The e-mail links to `/zaproszenie/<token>`. The link works once and for 7 days; only its SHA-256 is stored, a new invitation cancels the old one, and the teacher can cancel it. A teacher can send at most 30 invitations a day, so the app can't be used to spam.
3. The person creates the account: name, password, and who is signing up: the student (16 or older) or a parent or guardian (GDPR art. 8: under 16 a parent must agree). That choice and the time are stored on the invitation. The e-mail is fixed by the invitation and counts as verified.
   If the address already has a student account (another teacher invited them before), they sign in instead and the new teacher is added.
4. The account is linked through `students.user_id`, so one student can have several teachers, and each teacher only sees their own notebook, lessons and notes. The personal link (below) stops working once the account exists.
5. **Odłącz konto** in the panel removes the link; the student loses access on their next request, the account stays.

Students sign in at `/logowanie`, change their password at `/uczen/konto`, and use **Nie pamiętasz hasła?** when they forget it. With several teachers, `/uczen` shows the newest one for now (a switcher comes later).

### E-mail

Sent over SMTP with nodemailer (`apps/web/lib/mail.ts`), so any provider works. Settings: `SMTP_URL` and `MAIL_FROM`.
Locally, `npm run db:up` and `docker compose` also start **Mailpit**, which catches every e-mail: open http://localhost:8025. Without `SMTP_URL`, `npm run dev` prints e-mails to the console.

### Boards

Each student has a list of boards, most recently used first (`boards.kind`): the **Zeszyt** every student starts with, one board per **lesson**, and **free** boards (a mock exam, revision). **Tablica lekcji** next to a lesson opens its board, made on first use and titled from the date and topic (“Lekcja 5 paź · Funkcja kwadratowa”). A new lesson board starts with copies of the task cards left unfinished on the previous lesson board (with their task images), under “Do dokończenia z poprzedniej lekcji”; the originals stay where they were. The list shows how many task cards are solved (anything written in the solution area counts). **Kontynuuj** / **Kontynuuj tablicę** opens the board used last, for the teacher and the student. Teachers make free boards with **+ Nowa tablica** and rename boards with ✎; students see and use all boards of their notebook. **Sections** split a board into titled parts (“Matura próbna styczeń 2025”, “Matura 2026”): big frames stacked one under another, listed in the **📁 Sekcje** panel (click to jump there, ✎ to rename, **+ Sekcja** for teachers). New sections are big (2400 × 1600). Moving a section by its title band moves everything in it. Sections grow by themselves: anything written, drawn or pasted near a section's bottom or right edge (and any task card that grows inside it) makes it bigger, and what's below or beside it moves away; the corner handle of a selected section resizes it by hand. After pasting a task (or any image) on a board with sections, a **📁 Wstaw do sekcji** bar lets you move it, with its task card, under what's already in that section. A PDF goes into a new section named after the file by default (or into an existing section, or into free space). When a teacher types a name for a new board, boards and sections with a similar name are suggested (Polish endings and diacritics ignored, a shared year alone doesn't count) with **Dodaj sekcję … tam**, which opens that board and adds the section. Code: `apps/web/lib/boards.ts`, `packages/shared/src/cards.ts`, `packages/shared/src/titles.ts`.

### Personal link (no account)

For younger students: anyone with the link gets in, so an account is better.

1. On a student's page in the panel, the teacher clicks **Utwórz link dla ucznia** under **Link bez konta** and sends the link to the student (or a parent). The link is shown only once, and only its SHA-256 hash is stored.
2. The student opens `/uczen/wejdz/<token>`. That sets a signed, httpOnly cookie and redirects to **`/uczen`**, so the token doesn't stay in the address bar.
3. `/uczen` shows the student's notebook, the next lesson (with **Dołącz do wideo** from 15 minutes before the start), upcoming lessons and recently covered topics. It never shows teacher notes or other students.
4. **Mój zeszyt** (`/uczen/tablica`) opens the student's notebook-board. The teacher opens the same board from the panel (`/panel/zeszyt/<studentId>`) and gets Spotlight and Clear.
5. **Nowy link** replaces the old link, and **Wyłącz dostęp** turns access off. Either way the old link and existing sessions stop working on the next request.

**How the board knows who you are:** the web app signs a *ticket* (room, name, role, colour, expiry) with `SYNC_SECRET`, and the sync server checks it. Notebook rooms (`b-…`) can't be joined without a valid ticket, so a student can't pretend to be the teacher or open someone else's notebook. Open demo boards at `/board` still work without one.

**Images:** the browser scales a pasted image down to 2048 px and re-encodes it as WebP (which also removes photo metadata such as GPS location). It uploads it once to `POST /api/assets` with the board ticket, and only the file's address goes on the board. The server checks the real file type from its first bytes (PNG, JPEG, WebP and GIF only; no SVG) and limits files to 5 MB, 20 uploads a minute and 300 images per notebook. `GET /api/assets/<room>/<file>` serves an image only to that notebook's teacher or student, with `nosniff` and a locked-down CSP. The sync server also refuses image elements that point at another notebook's files. Files are stored in `apps/web/.data/assets` (later Supabase Storage). Deleting an image from the board doesn't delete the file yet.

**PDF worksheets:** the **PDF** button in a notebook (or dropping a PDF on the board) reads the file in the browser with pdf.js; the PDF itself is never uploaded. In **Zadania z miejscem na rozwiązanie** mode it finds task headings (“Zadanie 1.”, “Zad. 2”) in the text layer, as in CKE exam sheets, cuts the pages into one image per task (joining a task that continues on the next page, leaving out page headers and footers, trimming empty margins) and puts each task on a **task card**: one coloured background with the task number, the task on the left, an arrow, and a white solution area on the right. Scanned PDFs have no text layer, so **Całe strony** mode places whole pages with space for notes. Everything lands in free space to the right of what's already on the board, as ordinary elements (move, resize, delete), and one undo removes the whole import. On CKE sheets (matura, egzamin ósmoklasisty) a task keeps only its text and figures: the printed answer grid is light grey and left out, and its size sets the height of the solution area (a task the sheet gives three pages of grid gets a taller one). Examiner score boxes in the margins, side watermarks and repeating headers/footers (“Strona 5 z 29”) are cut off, and an intro heading (“Zadanie 12.”) is joined to its first part (“12.1.”). A pasted or dropped screenshot of a task (mostly light background with dark print) goes straight onto a task card; one Ctrl+Z keeps just the image. Photos and drawings stay plain images, and any selected image can still be turned into a task with **Miejsce na rozwiązanie**. Cards adapt to the solution: writing that gets near the bottom of the solution area makes the card taller, and everything below it in the same column moves down, so cards never overlap (the extra room isn't part of undo). Moving a card by its header or edge moves the task and everything written on it, like a frame. **Hints (AI):** under the task on a card there's a **💡 Podpowiedź** button. The first click sends only the task image (nothing about the student) to the AI and gets 3 hints, from gentle to concrete: a guiding question, the method with a pointer to the CKE formula sheet (“Zajrzyj do karty wzorów, dział …”, only sections from `apps/web/lib/ai/karta-wzorow.ts`), and the first step. They never give the answer. Each click shows the next one, and the card grows to fit. Hints are stored per task image (`task_hints`), so the same task for another student doesn't call the AI again. Limits: 40 AI calls per notebook and 300 per app a day. Settings: `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, optional `GEMINI_MODEL` (default `gemini-3.8-flash`, with fallbacks when the free plan is busy). Code: `apps/web/lib/ai/hints.ts`, `apps/web/app/api/hints/route.ts`.

Limits: the first 40 pages, 40 pieces per import, 60 uploads a minute. Code: `packages/board/src/board/pdf.ts`.

Known limit: a ticket is valid for 8 hours, so a student who is already inside a board stays connected after **Wyłącz dostęp** or **Odłącz konto** until they leave the page.

### Settings

| Where | Variable | Default | Meaning |
|---|---|---|---|
| `apps/web` | `SYNC_PUBLIC_URL` | `ws://localhost:3001/ws` | Sync server address, as the browser sees it |
| `apps/sync` | `PORT` | `3001` | Sync server port |
| `apps/sync` | `ALLOWED_ORIGINS` | `http://localhost:3000` | Web app addresses allowed to connect, comma separated |
| web, sync | `DATABASE_URL` | `postgres://teaching:teaching@localhost:55432/teaching` in development | PostgreSQL connection. **Required** in production |
| both | `SYNC_SECRET` | dev value in `npm run dev` | Signs board tickets. **Required** in production, and must be the same in web and sync |
| `apps/web` | `SESSION_SECRET` | dev value in `npm run dev` | Signs the student link cookie and the Google sign-in cookie. **Required** in production |
| `apps/web` | `APP_URL` | `http://localhost:3000` in development | Public address, used in e-mail links and for Google. **Required** in production |
| `apps/web` | `SMTP_URL` | none (e-mails printed to the console) | SMTP server, e.g. `smtp://localhost:1025` (Mailpit) or `smtps://user:pass@email-smtp.eu-central-1.amazonaws.com:465`. **Required** in production |
| `apps/web` | `MAIL_FROM` | `Doodle Board <no-reply@localhost>` | Sender of e-mails; must be an address the provider has verified |

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
    Dockerfile         Self-contained production image (Next.js standalone)
    app/globals.css    Tailwind + design tokens (bg-paper, text-ink, shadow-hard…)
    app/panel/         Teacher panel pages
    components/        UI kit (ui.tsx), forms, lesson row, navigation
    lib/               data.ts (queries), actions.ts (server actions), validation.ts, session.ts, time.ts
  sync/                Live-sync server (WebSocket), TypeScript
    src/server.ts      Connections, validation, limits, teacher-only actions
    src/rooms.ts       Boards in memory + saving to Postgres (board_elements)
    Dockerfile         Image for the sync server and database migrations
packages/
  db/                  Database: Drizzle schema, migrations (drizzle/), seed data, postgres.js client
  shared/              Zod schemas and types shared by browser and server
    src/elements.ts    Board elements and limits
    src/messages.ts    Live-sync messages
  board/               The whiteboard: canvas engine + React UI
    src/board/         engine.ts (tools, undo, camera, spotlight), geometry.ts, render.ts
    src/components/    Dock, style bubble, people, join screen, toasts…
    src/styles.css     Board look & feel (colours are CSS variables at the top)
docs/ARCHITECTURE.md   Tech stack, data model, plan
docker-compose.yml     PostgreSQL for development; the full stack with --profile app
```

Frontend code lives in `apps/web` and `packages/board`. Backend code lives in `apps/sync` and, later, the API routes in `apps/web`. Both sides validate with the same schemas from `packages/shared`.

## Graphics tablets and styluses

Pen input uses Pointer Events, so tablets (Huion, Wacom, XP-Pen) and styluses work in any modern browser: pressure sets the line width, every sample is used (coalesced events) and a few predicted points are drawn ahead of the line so it keeps up with a fast pen (shown only, never saved). Once a pen is used, the pen tool's colour bubble shows **delikatny / normalny / mocny** pressure sensitivity (remembered per browser) and a dot: green when real pressure comes through, red when the tablet reports none.

If the dot is red: on Windows turn on **Windows Ink** in the tablet driver; on macOS give the tablet driver the *Accessibility* and *Input Monitoring* permissions. Tablet buttons can be mapped in the driver to the board's shortcuts: **P** pen, **E** eraser, **V** select, **H** hand, **Ctrl+Z** undo, **Ctrl+K** ✨ drawing. The pen's side button acting as a right click pans the board.

## ✨ Drawing with AI

**✨ Rysuj** on the top bar (or Ctrl+K), or **✨ Rysunek** in a task card's solution area: describe a figure in words (“okrąg wpisany w czworokąt ABCD”, “dwa okręgi styczne zewnętrznie”, “trójkąt ABC z wysokością CD”, “wykres y = x^2 − 4x + 3”). The AI only returns a *description* of the drawing (points, segments, circles and constructions such as inscribed/circumscribed circles, tangent circles, tangents from a point, feet of perpendiculars, intersections, axes and graphs); `packages/shared/src/drawing.ts` computes the geometry exactly (an inscribed circle really touches every side) and turns it into ordinary board elements. Graphs are drawn by a small formula parser (`packages/shared/src/expr.ts`: numbers, x, + − · / ^, brackets, sin/cos/tg/sqrt/abs/ln/log/exp), never by running code. A preview comes first (Wstaw / Spróbuj inaczej); inserting is one undo step. The AI is told never to solve or add values that weren't asked for; its answer is validated before anything is drawn. Same daily AI limits as hints (`apps/web/lib/ai/limits.ts`).

**Shapes** (rectangle, ellipse, triangle): click inside to select; 8 handles resize like in Miro (Shift keeps proportions), the round handle above rotates (Shift: steps of 15°). Lines and arrows have a handle at each end. The eraser still takes shapes only by their edge, so erasing writing inside a shape keeps the shape.

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
