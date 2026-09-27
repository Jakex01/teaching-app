import Link from 'next/link';

export const metadata = { title: 'Logowanie · Doodle Board' };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-md rotate-1 rounded-[26px] border-[2.5px] border-ink bg-white p-8 shadow-hard-lg">
        <div className="mb-2 text-4xl">🔐</div>
        <h1 className="mb-2 font-fun text-3xl font-bold">Logowanie już wkrótce</h1>
        <p className="mb-6 font-bold opacity-70">
          Panel nauczyciela jest na razie dostępny tylko w trybie deweloperskim (<code>npm run dev</code>).
          Prawdziwe logowanie to kolejne zadanie w planie.
        </p>
        <Link href="/" className="font-extrabold underline">← Strona główna</Link>
      </div>
    </main>
  );
}
