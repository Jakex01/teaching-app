// Creates a teacher account, or sets a new password for an existing one.
//   npm run teacher:create -- --email kuba@example.com --name "Kuba"
// In Docker: docker compose run --rm migrate node --import tsx packages/db/src/create-teacher.ts --email … --name …
// The password is typed in (hidden), never passed on the command line, so it doesn't end up in shell history.

import readline from 'node:readline';
import { Writable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from './client';
import { hashPassword, normalizeEmail, passwordProblem } from './passwords';
import { sessions, teacherProfiles, users } from './schema';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

// Reads answers line by line, so it works both when typing in a terminal and when input is piped in.
let muted = false;
const output = new Writable({ write(chunk, _enc, done) { if (!muted) process.stdout.write(chunk); done(); } });
const rl = readline.createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
const lines = rl[Symbol.asyncIterator]();

async function ask(q: string) {
  process.stdout.write(q);
  const { value, done } = await lines.next();
  if (done) throw new Error('Przerwano.');
  return String(value);
}

/** Like ask(), but what you type isn't shown. */
async function askHidden(q: string) {
  process.stdout.write(q);
  muted = true;
  try {
    const { value, done } = await lines.next();
    if (done) throw new Error('Przerwano.');
    return String(value);
  } finally {
    muted = false;
    process.stdout.write('\n');
  }
}

try {
  const email = normalizeEmail(arg('email') ?? (await ask('E-mail: ')));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('To nie wygląda na adres e-mail.');

  const db = getDb();
  const [existing] = await db.select({ id: users.id, name: users.displayName, role: users.role }).from(users).where(eq(users.email, email));
  if (existing?.role === 'student') throw new Error(`${email} to konto ucznia. Nauczyciel potrzebuje osobnego adresu.`);
  if (existing) {
    const yes = (await ask(`Konto ${email} (${existing.name}) już istnieje. Ustawić nowe hasło? [t/N] `)).trim().toLowerCase();
    if (yes !== 't' && yes !== 'tak') throw new Error('Przerwano.');
  }
  const name = existing?.name ?? (arg('name') ?? (await ask('Imię (widoczne dla uczniów): '))).trim().slice(0, 40);
  if (!name) throw new Error('Podaj imię.');

  let password = '';
  for (;;) {
    password = await askHidden('Hasło (min. 12 znaków): ');
    const problem = passwordProblem(password, email);
    if (problem) { console.log(problem); continue; }
    // eslint-disable-next-line security/detect-possible-timing-attacks -- local check that both typed passwords match
    if ((await askHidden('Powtórz hasło: ')) !== password) { console.log('Hasła się różnią.'); continue; }
    break;
  }
  const passwordHash = await hashPassword(password);

  if (existing) {
    await db.transaction(async tx => {
      await tx.update(users).set({ passwordHash, passwordUpdatedAt: new Date() }).where(eq(users.id, existing.id));
      await tx.delete(sessions).where(eq(sessions.userId, existing.id)); // sign out everywhere
      await tx.insert(teacherProfiles).values({ userId: existing.id }).onConflictDoNothing();
    });
    console.log(`Nowe hasło ustawione dla ${email}. Wszystkie urządzenia zostały wylogowane.`);
  } else {
    await db.transaction(async tx => {
      const [user] = await tx.insert(users).values({ email, displayName: name, role: 'teacher', passwordHash, passwordUpdatedAt: new Date() }).returning({ id: users.id });
      await tx.insert(teacherProfiles).values({ userId: user.id });
    });
    console.log(`Konto nauczyciela utworzone: ${email}`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  rl.close();
  await closeDb();
}
