# Teaching App – Roadmap i brief produktowy

> **Dla agenta AI (Cursor):** ten plik opisuje, dokąd zmierza projekt. Przeczytaj go w całości razem z `README.md` i kodem w repozytorium, zanim cokolwiek zaproponujesz. Twoje pierwsze zadanie jest opisane w sekcji [9. Zadanie dla agenta](#9-zadanie-dla-agenta-rekomendacja-technologii). **Nie pisz jeszcze kodu produkcyjnego.** Najpierw przygotuj rekomendację technologii.

---

## 1. Wizja

Narzędzie dla **korepetytorów** do prowadzenia lekcji online i zarządzania całą działalnością w jednym miejscu.

**Wyróżnik:** Zoom, Meet czy Miro kończą się razem z lekcją. U nas **każdy uczeń ma stały „zeszyt-tablicę”**, w którym zostaje historia wszystkich lekcji. Po lekcji **AI przygotowuje podsumowanie dla rodzica i proponuje pracę domową**.

## 2. Użytkownicy i model biznesowy

| Rola | Opis | Płaci? |
|---|---|---|
| **Nauczyciel / korepetytor** (główny klient) | Pracuje na własny rachunek, ma 5–40 uczniów. Przedmioty: matematyka, języki, fizyka, chemia. Rynek startowy: Polska. | Tak – subskrypcja |
| **Uczeń** | Szkoła podstawowa, liceum, studia. Często niepełnoletni. | Nie |
| **Rodzic** | Opłaca lekcje, chce widzieć postępy dziecka. | Nie (pośrednio płaci nauczycielowi) |
| **Szkoła / agencja** (później) | Wielu nauczycieli, jeden administrator. | Tak – plan zespołowy |

**Założenie cenowe (do weryfikacji):**
- Free: do 2–3 uczniów.
- Pro: bez limitu uczniów, z funkcjami AI, ok. 49–79 zł/mies.

## 3. Stan obecny (prototyp „Doodle Board”)

- `server.js` – serwer Node.js bez zależności. Ma ręcznie napisany WebSocket, pokoje wybierane przez `?room=` i zapis tablic do `data/<room>.json`.
- `public/` – vanilla JS, rysowanie na Canvas 2D. Narzędzia: pen, highlighter, eraser, rect, ellipse, triangle, line, arrow, text, select/move.
- Współpraca na żywo: kursory innych osób, zmiany widoczne od razu, undo/redo. Nauczyciel ma **Spotlight** (uczniowie widzą to co on) i przycisk **Clear**.
- **Brak** kont, bazy danych i autoryzacji. Rolę „nauczyciel” może wybrać każdy.
- **Styl wizualny (zachować!):** „playful bold”.
  - Kremowe tło z kropkami `#FFF6E5`.
  - Grube obramowania w kolorze ink `#1E1B3A` z twardym cieniem.
  - Paleta: tomato `#FF5A4E`, tangerine `#FF9F1C`, sunflower `#FFC93C`, mint `#22C1A0`, sky `#3D8BFF`, grape `#8B5CF6`, bubblegum `#FF6FB5`.
  - Fonty: Fredoka (nagłówki) i Nunito (tekst). Sprężyste animacje.
  - Pływający dock z narzędziami na dole ekranu.

Prototyp służy do walidacji UX. Nie trzeba zachowywać jego architektury, ale **wygląd i odczucie z używania tak**.

---

## 4. Etap 1 – MVP: „Da się na tym prowadzić lekcję”

**Cel:** nauczyciel prowadzi prawdziwą lekcję z prawdziwym uczniem i wszystko się zapisuje.

- [ ] **Konta i logowanie.** E-mail + magic link lub Google. Role: nauczyciel i uczeń.
- [ ] **Zaproszenie ucznia** przez link lub e-mail. Uczeń jest przypisany do nauczyciela.
- [ ] **Osobna tablica dla każdego ucznia**, podzielona na **strony**: jedna lekcja to jedna strona. Historia jest trwała.
- [ ] **Uprawnienia.** Uczeń widzi tylko swoje tablice. Nauczyciel widzi tablice wszystkich swoich uczniów.
- [ ] **Współpraca na żywo** jak w prototypie: kursory, obecność, Spotlight. Musi działać stabilnie przy słabym internecie, z możliwością pracy offline i ponownym połączeniem.
- [ ] **Narzędzia do nauki na tablicy:**
  - [ ] wgrywanie PDF-ów i zdjęć z rysowaniem po nich (np. arkusz maturalny),
  - [ ] wzory matematyczne (LaTeX, np. KaTeX/MathLive),
  - [ ] tło w kratkę lub linie, linijka i kątomierz do geometrii,
  - [ ] wykres funkcji,
  - [ ] karteczki (sticky notes),
  - [ ] eksport strony lub całej tablicy do PDF/PNG.
- [ ] **Tablet i rysik:** iPad + Apple Pencil, rozróżnianie siły nacisku, odrzucanie dotyku dłoni.
- [ ] **Wideo:** na start link do Meet/Zoom przypięty do lekcji. Później wideo wbudowane w aplikację.
- [ ] **Wdrożenie produkcyjne** z własną domeną i HTTPS.

**Kryterium ukończenia:** 5 prawdziwych nauczycieli prowadzi na tym swoje lekcje przez 2 tygodnie.

## 5. Etap 2 – Zarządzanie korepetycjami (monetyzacja)

- [ ] **Kalendarz** nauczyciela z godzinami dostępności i lekcjami cyklicznymi (np. co wtorek o 17:00).
- [ ] **Publiczny link do rezerwacji** – uczeń lub rodzic sam wybiera termin.
- [ ] **Przypomnienia** e-mail i SMS (24 h i 1 h przed lekcją).
- [ ] **Płatności:**
  - metody: BLIK, Przelewy24, karta,
  - **pakiety lekcji** (np. 10 lekcji w cenie X),
  - zasady odwoływania lekcji (np. później niż 24 h przed = płatna),
  - status płatności: opłacone / zaległe.
- [ ] **Subskrypcja SaaS** nauczyciela (Free/Pro) – rozliczenie nas z nauczycielem, oddzielnie od płatności uczniów.
- [ ] **Kartoteka ucznia:** notatki, poziom, cel (np. matura rozszerzona), obecności, lista tablic.
- [ ] **Pulpit nauczyciela:** dzisiejsze lekcje, przychód w miesiącu, zaległości.
- [ ] (Opcjonalnie) faktury i rachunki.

## 6. Etap 3 – AI (przewaga konkurencyjna)

- [ ] **Podsumowanie lekcji.** AI czyta zawartość strony tablicy (tekst, wzory, OCR pisma odręcznego) i notatki nauczyciela. Tworzy krótki raport: co przerobiono, z czym był problem, co dalej. Nauczyciel akceptuje raport i wysyła go rodzicowi.
- [ ] **Generator zadań i prac domowych** dopasowany do poziomu i celu ucznia. Zadania trafiają od razu jako nowa strona tablicy.
- [ ] **Tryb podpowiedzi dla ucznia** przy pracy domowej. AI naprowadza pytaniami metodą sokratejską i **nie podaje gotowego rozwiązania**.
- [ ] **Rozpoznawanie pisma odręcznego i wzorów** oraz sprawdzanie rozwiązań.
- [ ] **Miesięczny raport postępów** dla rodzica.
- [ ] Kontrola kosztów AI: limity na plan, cache, wybór modelu zależny od zadania.

## 7. Etap 4 – Skalowanie

- [ ] Panel rodzica (osobne konto: postępy, płatności, kalendarz).
- [ ] Publiczny profil nauczyciela (SEO, opinie, cennik, link do rezerwacji).
- [ ] Plan zespołowy dla szkół językowych i agencji: wielu nauczycieli, administrator, raporty.
- [ ] Biblioteka materiałów i szablonów tablic, z możliwością udostępniania.
- [ ] Aplikacja mobilna lub PWA z powiadomieniami push.
- [ ] Wiele języków interfejsu (PL → EN → inne).

---

## 8. Wymagania niefunkcjonalne (obowiązują od Etapu 1)

- **RODO i dane niepełnoletnich:**
  - zgoda rodzica dla uczniów poniżej 16 lat,
  - dane przechowywane w UE,
  - polityka prywatności i DPA,
  - możliwość eksportu i usunięcia danych,
  - dane do AI przetwarzane zgodnie z RODO, bez trenowania modeli na danych uczniów.
- **Bezpieczeństwo:**
  - autoryzacja sprawdzana po stronie serwera dla każdej operacji na tablicy (również przez WebSocket),
  - brak sekretów w kodzie klienta.
- **Wydajność:** płynne rysowanie (60 fps) przy tablicy z ponad 5000 elementów i ponad 30 osobach w pokoju.
- **Niezawodność:** zero utraty danych przy rozłączeniu. Automatyczny zapis i wersjonowanie stron.
- **Koszty:** niskie przy małej skali. Start z budżetem rzędu 0–50 USD/mies.
- **Zespół:** 1 osoba, początkujący–średniozaawansowany programista, mocno wspierany przez AI. Preferowane technologie popularne, dobrze udokumentowane i dobrze znane modelom AI.

---

## 9. Zadanie dla agenta: rekomendacja technologii

Na podstawie etapów 1–4 i wymagań z sekcji 8 przygotuj plik **`docs/ARCHITECTURE.md`** zawierający:

1. **Rekomendowany stack** z uzasadnieniem, w podziale na:
   - frontend (framework, stylowanie, zarządzanie stanem),
   - **silnik tablicy**: własny Canvas vs. biblioteka (np. tldraw SDK, Excalidraw, Konva, Fabric.js). Uwzględnij licencje i koszty komercyjne, obsługę rysika, możliwość zachowania naszego unikalnego UI oraz dodawania własnych narzędzi (LaTeX, wykresy, PDF),
   - **synchronizacja na żywo**: np. Yjs + y-websocket/Hocuspocus, Liveblocks, PartyKit, Supabase Realtime, własny serwer. Porównaj offline, koszty, vendor lock-in i autoryzację,
   - backend/API i baza danych: np. Next.js + Postgres (Supabase/Neon), ORM,
   - autoryzacja: np. Supabase Auth, Clerk, Auth.js,
   - przechowywanie plików (PDF, obrazy),
   - płatności: Stripe (BLIK/P24) vs. Przelewy24 bezpośrednio vs. inne; osobno subskrypcje SaaS i płatności uczniów (Stripe Connect?),
   - wideo: link zewnętrzny vs. LiveKit / Daily / Jitsi,
   - e-mail/SMS: np. Resend, Twilio, SMSAPI,
   - AI: dostawca modeli (np. Claude API), OCR pisma i wzorów, sposób przekazywania zawartości tablicy do modelu,
   - hosting i wdrożenie (region UE!), monitoring (np. Sentry), analityka.
2. **Porównanie 2–3 alternatyw** dla kluczowych decyzji (silnik tablicy, sync, backend) w tabeli: plusy, minusy, koszt, ryzyko.
3. **Model danych** (szkic): User, Teacher, Student, Parent, Board, Page, Lesson, Booking, Package, Payment, Subscription, AiSummary.
4. **Plan migracji z prototypu**: co przenosimy (UI, styl, logika narzędzi), co przepisujemy.
5. **Szacunek miesięcznych kosztów** infrastruktury przy 10, 100 i 1000 aktywnych nauczycieli.
6. **Plan pracy dla Etapu 1** podzielony na małe zadania (1–2 dni każde), w kolejności.
7. **Pytania otwarte i ryzyka**, które powinienem rozstrzygnąć przed startem.

Zasady:
- Nie zakładaj, że najnowsza lub najmodniejsza technologia jest najlepsza. Priorytety: prostota, koszt, dojrzałość, dobra dokumentacja.
- Jeśli czegoś nie wiesz na pewno (ceny, licencje), zaznacz to i podaj link do źródła do sprawdzenia.
- Na koniec zadaj mi maksymalnie 5 pytań, które najbardziej zmienią rekomendację.

---

## 10. Walidacja rynkowa (równolegle do Etapu 1)

Przeprowadzić rozmowy z 10 korepetytorami. Pytania:
1. Jak dziś prowadzisz lekcje online? Jakich narzędzi używasz?
2. Co Cię w tym najbardziej irytuje lub zabiera najwięcej czasu?
3. Jak zarządzasz terminami, płatnościami i odwołaniami?
4. Jak informujesz rodziców o postępach?
5. Czy zapłaciłbyś 50 zł/mies. za narzędzie, które rozwiązuje punkty 2–4? Co musiałoby mieć?
