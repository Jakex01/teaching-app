import Link from 'next/link';
import { AuthCard } from '@/components/AuthCard';
import { ResetRequestForm } from '@/components/PasswordResetForms';

export const metadata = { title: 'Nowe hasło · Doodle Board' };

export default function ResetRequestPage() {
  return (
    <AuthCard title="Nie pamiętasz hasła?" subtitle="Podaj e-mail konta, a wyślemy link do ustawienia nowego hasła.">
      <ResetRequestForm />
      <p className="mt-5 text-sm font-bold"><Link href="/logowanie" className="underline opacity-70">← Wróć do logowania</Link></p>
    </AuthCard>
  );
}
