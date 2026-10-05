import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { Button, Card, PageHeader, SectionTitle } from '@/components/ui';
import { logout } from '@/lib/auth-actions';
import { requireTeacher } from '@/lib/session';

export const metadata = { title: 'Konto' };

export default async function AccountPage() {
  const teacher = await requireTeacher();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Konto" subtitle={teacher.email ?? teacher.displayName} />
      <SectionTitle>Zmiana hasła</SectionTitle>
      <Card className="mb-8 p-5 sm:p-6">
        <ChangePasswordForm />
      </Card>
      <form action={logout}>
        <Button variant="secondary">Wyloguj się</Button>
      </form>
    </div>
  );
}
