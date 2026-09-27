export const metadata = { title: 'Brak dostępu · Doodle Board' };

export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ wylogowano?: string }> }) {
  const { wylogowano } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-md -rotate-1 rounded-[26px] border-[2.5px] border-ink bg-white p-8 shadow-hard-lg">
        <div className="mb-2 text-4xl">{wylogowano ? '👋' : '🔑'}</div>
        <h1 className="mb-2 font-fun text-3xl font-bold">{wylogowano ? 'Do zobaczenia!' : 'Potrzebujesz swojego linku'}</h1>
        <p className="font-bold opacity-70">
          {wylogowano
            ? 'Wylogowano. Żeby wrócić, otwórz ponownie link od nauczyciela.'
            : 'Do swojego zeszytu wchodzisz przez osobisty link od nauczyciela. Jeśli link przestał działać, poproś o nowy.'}
        </p>
      </div>
    </main>
  );
}
