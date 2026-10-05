import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { Card, SectionTitle } from '@/components/ui';
import { requireStudent } from '@/lib/student-session';
import { requireUser } from '@/lib/session';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Konto · Doodle Board' };

export default async function StudentAccountPage() {
  const session = await requireStudent();
  if (session.via !== 'account') redirect('/uczen');
  const user = await requireUser();

  return (
    <>
      <h1 className="mb-1 font-fun text-3xl font-bold tracking-tight">Konto</h1>
      <p className="mb-6 font-bold opacity-60">{user.email}</p>
      <SectionTitle>Zmiana hasła</SectionTitle>
      <Card className="max-w-lg p-5">
        <ChangePasswordForm />
      </Card>
    </>
  );
}
