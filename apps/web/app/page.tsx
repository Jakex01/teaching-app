import Link from 'next/link';

export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-md -rotate-1 rounded-[26px] border-[2.5px] border-ink bg-white p-8 shadow-hard-lg">
        <span className="inline-block -rotate-2 rounded-full border-[2.5px] border-ink bg-sun px-3 py-0.5 text-sm font-extrabold">
          Etap 1 · w budowie
        </span>
        <h1 className="mt-4 mb-3 font-fun text-4xl leading-tight font-bold tracking-tight">
          Doodle<span className="text-tomato">Board</span>
        </h1>
        <p className="mb-6 font-bold opacity-70">
          Stała tablica-zeszyt dla każdego ucznia. Na razie działa tablica na żywo; konta i zeszyty są w drodze.
        </p>
        <Link
          href="/board"
          className="flex w-full items-center justify-center rounded-2xl border-[2.5px] border-ink bg-tomato p-3.5 font-fun text-lg text-white shadow-hard transition-transform duration-150 ease-bounce hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          Otwórz tablicę →
        </Link>
      </div>
    </main>
  );
}
