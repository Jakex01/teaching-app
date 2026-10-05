import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { NewPasswordForm } from '@/components/PasswordResetForms';
import { findPasswordReset } from '@/lib/password-reset';

// The secret token is in this page's address, so never send it on in a Referer header.
export const metadata: Metadata = { title: 'Nowe hasło · Doodle Board', referrer: 'no-referrer', robots: { index: false } };

export default async function NewPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reset = await findPasswordReset(token);
  if (!reset?.email) {
    return (
      <AuthCard title="Link nie działa" subtitle="Wygasł (działa godzinę) albo został już użyty.">
        <Link href="/reset-hasla" className="font-extrabold text-tomato underline">Poproś o nowy link →</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Ustaw nowe hasło" subtitle={`Dla konta ${reset.email}. Po zmianie wylogujemy wszystkie urządzenia.`}>
      <NewPasswordForm token={token} email={reset.email} />
    </AuthCard>
  );
}
