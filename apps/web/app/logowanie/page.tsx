import { redirect } from 'next/navigation';
import { DEV_TEACHER_EMAIL } from '@teaching/db';
import Link from 'next/link';
import { AuthCard, Notice } from '@/components/AuthCard';
import { LoginForm } from '@/components/LoginForm';
import { GoogleIcon } from '@/components/icons';
import { googleEnabled } from '@/lib/google';
import { getSessionUser, getTeacher } from '@/lib/session';

export const metadata = { title: 'Logowanie · Doodle Board' };

const ERRORS: Record<string, string> = {
  'google': 'Nie udało się zalogować przez Google. Spróbuj ponownie.',
  'google-anulowano': 'Logowanie przez Google zostało przerwane.',
  'google-wygaslo': 'Logowanie trwało za długo albo zostało rozpoczęte w innej karcie. Spróbuj ponownie.',
  'google-email': 'Google nie potwierdził tego adresu e-mail.',
  'google-wylaczone': 'Logowanie przez Google nie jest włączone.',
  'brak-konta': 'Z tym kontem Google nie jest połączone żadne konto. Uczniowie zakładają konto z zaproszenia od nauczyciela.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; blad?: string; wylogowano?: string; haslo?: string }> }) {
  const user = await getSessionUser();
  if (user?.role === 'student') redirect('/uczen');
  if (user && (await getTeacher())) redirect('/panel');
  const { next, blad, wylogowano, haslo } = await searchParams;
  const error = blad ? ERRORS[blad] : undefined;

  return (
    <AuthCard title="Zaloguj się" subtitle="Dla nauczycieli i uczniów.">
      {error && (
        <Notice tone="error">{error}</Notice>
      )}
      {haslo && <Notice tone="ok">✓ Hasło zmienione. Zaloguj się nowym hasłem.</Notice>}
      {wylogowano && <Notice>Wylogowano. Do zobaczenia!</Notice>}
      {googleEnabled() && (
        <>
          {/* A plain link (GET), not a form: the CSP's form-action would block the redirect to Google. */}
          <a
            href="/api/auth/google"
            className="flex w-full items-center justify-center gap-3 rounded-2xl border-[2.5px] border-ink bg-white p-3 font-extrabold shadow-hard-sm transition-transform duration-150 ease-bounce hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-none [&_svg]:size-5"
          >
            <GoogleIcon />Zaloguj przez Google
          </a>
          <div className="my-5 flex items-center gap-3 text-xs font-extrabold tracking-wider uppercase opacity-40">
            <span className="h-0.5 flex-1 bg-ink/30" />albo e-mailem<span className="h-0.5 flex-1 bg-ink/30" />
          </div>
        </>
      )}
      <LoginForm next={next} />
      <p className="mt-4 text-sm font-bold"><Link href="/reset-hasla" className="underline opacity-70">Nie pamiętasz hasła?</Link></p>
      <p className="mt-3 text-sm font-bold opacity-50">
        Jesteś uczniem bez konta? Konto zakładasz z zaproszenia, które nauczyciel wysyła e-mailem.
      </p>
      {process.env.NODE_ENV === 'development' && (
        <p className="mt-4 rounded-2xl border-2 border-dashed border-ink/30 p-3 text-xs font-bold opacity-70">
          Tryb deweloperski: konto testowe <code>{DEV_TEACHER_EMAIL}</code>, hasło w README.
        </p>
      )}
    </AuthCard>
  );
}
