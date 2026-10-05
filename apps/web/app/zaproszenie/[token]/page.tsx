import type { Metadata } from 'next';
import Link from 'next/link';
import { eq, getDb, users } from '@teaching/db';
import { AuthCard, Notice } from '@/components/AuthCard';
import { InviteLoginForm, InviteSignupForm } from '@/components/InviteForms';
import { Button } from '@/components/ui';
import { acceptSignedIn } from '@/lib/invite-actions';
import { findInvitation } from '@/lib/invitations';
import { getSessionUser } from '@/lib/session';

// The secret token is in this page's address, so never send it on in a Referer header.
export const metadata: Metadata = { title: 'Zaproszenie · Doodle Board', referrer: 'no-referrer', robots: { index: false } };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await findInvitation(token);

  if (!invitation) {
    return (
      <AuthCard title="Zaproszenie nie działa" subtitle="Link wygasł, został już użyty albo nauczyciel go anulował.">
        <p className="mb-5 font-bold opacity-70">Poproś nauczyciela o nowe zaproszenie. Jeśli masz już konto, po prostu się zaloguj.</p>
        <Link href="/logowanie" className="font-extrabold text-tomato underline">Przejdź do logowania →</Link>
      </AuthCard>
    );
  }

  // Names aren't declined (Polish grammar), so they stand on their own after a colon.
  const subtitle = `${invitation.teacherName} zaprasza na lekcje: wspólny zeszyt i plan zajęć w jednym miejscu. Konto dla ucznia: ${invitation.studentFirstName}.`;
  const user = await getSessionUser();

  if (user?.role === 'student' && user.email === invitation.email) {
    return (
      <AuthCard title="Zaproszenie na lekcje" subtitle={subtitle}>
        <form action={acceptSignedIn.bind(null, token)}>
          <Button type="submit" variant="primary" size="lg" className="w-full">Przyjmij zaproszenie →</Button>
        </form>
      </AuthCard>
    );
  }

  const [existing] = await getDb().select({ role: users.role }).from(users).where(eq(users.email, invitation.email));

  if (existing?.role === 'teacher') {
    return (
      <AuthCard title="Zaproszenie na lekcje" subtitle={subtitle}>
        <Notice tone="error">Adres {invitation.email} należy do konta nauczyciela. Poproś o zaproszenie na adres ucznia lub rodzica.</Notice>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Zaproszenie na lekcje" subtitle={subtitle}>
      {user && <Notice>Jesteś zalogowany jako {user.email}. Przyjęcie zaproszenia przełączy Cię na konto ucznia.</Notice>}
      {existing ? (
        <>
          <p className="mb-4 font-bold">Masz już konto ucznia. Zaloguj się, żeby dołączyć do lekcji z {invitation.teacherName}.</p>
          <InviteLoginForm token={token} email={invitation.email} />
          <p className="mt-4 text-sm font-bold"><Link href="/reset-hasla" className="underline opacity-70">Nie pamiętasz hasła?</Link></p>
        </>
      ) : (
        <InviteSignupForm token={token} email={invitation.email} defaultName={invitation.studentFirstName} />
      )}
    </AuthCard>
  );
}
