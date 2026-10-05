import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

// Sends e-mail over SMTP, so any provider works: Amazon SES, Resend, Brevo, or Mailpit locally.
//   SMTP_URL   smtps://user:password@email-smtp.eu-central-1.amazonaws.com:465   (or smtp://localhost:1025 for Mailpit)
//   MAIL_FROM  Doodle Board <no-reply@your-domain.pl>
// Without SMTP_URL in development, e-mails are printed to the server console instead.

let transport: Transporter | null = null;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(mail: Mail) {
  const url = process.env.SMTP_URL;
  if (!url) {
    if (process.env.NODE_ENV !== 'development') throw new Error('SMTP_URL is not set');
    console.info(`\n[e-mail, not sent: SMTP_URL is not set]\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return;
  }
  transport ??= nodemailer.createTransport(url);
  await transport.sendMail({
    from: process.env.MAIL_FROM || 'Doodle Board <no-reply@localhost>',
    to: mail.to,
    subject: mail.subject.replace(/[\r\n]+/g, ' '),
    text: mail.text,
    html: mail.html,
  });
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A plain, friendly layout that works in every mail client. All values passed in are escaped here. */
function layout({ heading, paragraphs, button, footer }: { heading: string; paragraphs: string[]; button: { label: string; url: string }; footer: string }) {
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#1d1a2f">${escapeHtml(t)}</p>`;
  return `<!doctype html><html lang="pl"><body style="margin:0;padding:24px;background:#fff8ec;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:2px solid #1d1a2f;border-radius:18px;padding:28px">
<tr><td>
<p style="margin:0 0 18px;font-size:20px;font-weight:bold;color:#1d1a2f">Doodle<span style="color:#ff5a4e">Board</span></p>
<h1 style="margin:0 0 16px;font-size:22px;color:#1d1a2f">${escapeHtml(heading)}</h1>
${paragraphs.map(p).join('\n')}
<p style="margin:22px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#ff5a4e;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border:2px solid #1d1a2f;border-radius:14px">${escapeHtml(button.label)}</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b6780">Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br><span style="word-break:break-all">${escapeHtml(button.url)}</span></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6b6780">${escapeHtml(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function invitationMail({ to, teacherName, studentName, url, days }: { to: string; teacherName: string; studentName: string; url: string; days: number }): Mail {
  const lines = [
    `${teacherName} zaprasza Cię do Doodle Board: wspólnego zeszytu i planu lekcji. Konto będzie dla ucznia: ${studentName}.`,
    'Kliknij przycisk, żeby założyć konto. Jeśli uczeń ma mniej niż 16 lat, konto powinien założyć rodzic lub opiekun.',
  ];
  const footer = `Link działa ${days} dni i tylko raz. Jeśli nie spodziewasz się tej wiadomości, po prostu ją zignoruj.`;
  return {
    to,
    subject: `${teacherName} zaprasza do Doodle Board`,
    text: `${lines.join('\n\n')}\n\nZałóż konto: ${url}\n\n${footer}\n`,
    html: layout({ heading: 'Zaproszenie na lekcje', paragraphs: lines, button: { label: 'Przyjmij zaproszenie', url }, footer }),
  };
}

export function passwordResetMail({ to, name, url, minutes }: { to: string; name: string; url: string; minutes: number }): Mail {
  const lines = [`Cześć ${name}!`, 'Ktoś (mamy nadzieję, że Ty) poprosił o ustawienie nowego hasła do Doodle Board.'];
  const footer = `Link działa ${minutes} minut i tylko raz. Jeśli to nie Ty, zignoruj tę wiadomość: Twoje hasło się nie zmieni.`;
  return {
    to,
    subject: 'Ustaw nowe hasło do Doodle Board',
    text: `${lines.join('\n\n')}\n\nUstaw nowe hasło: ${url}\n\n${footer}\n`,
    html: layout({ heading: 'Nowe hasło', paragraphs: lines, button: { label: 'Ustaw nowe hasło', url }, footer }),
  };
}
