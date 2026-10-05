import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/ui';
import { logout } from '@/lib/auth-actions';

export const metadata = { title: 'Brak dostępu · Doodle Board' };

export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ wylogowano?: string; konto?: string }> }) {
  const { wylogowano, konto } = await searchParams;

  if (konto) {
    return (
      <AuthCard title="Brak aktywnych lekcji" subtitle="Twoje konto nie jest teraz połączone z żadnym nauczycielem.">
        <p className="mb-5 font-bold opacity-70">Jeśli to pomyłka, poproś nauczyciela o nowe zaproszenie e-mailem.</p>
        <form action={logout}><Button type="submit">Wyloguj się</Button></form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={wylogowano ? 'Do zobaczenia! 👋' : 'Ten link nie działa 🔑'}
      subtitle={wylogowano ? 'Wylogowano.' : 'Link wygasł albo nauczyciel wyłączył dostęp.'}
    >
      <p className="mb-5 font-bold opacity-70">
        Masz konto ucznia? Zaloguj się e-mailem. Jeśli nie, poproś nauczyciela o zaproszenie albo nowy link.
      </p>
      <Link href="/logowanie" className="font-extrabold text-tomato underline">Przejdź do logowania →</Link>
    </AuthCard>
  );
}
