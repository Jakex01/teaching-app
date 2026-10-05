// Sections of the CKE formula sheet "Wybrane wzory matematyczne" (egzamin maturalny, Formuła 2023),
// with what each one contains. The AI may only point students to these, so it can't invent a section.
// TODO: check names and contents against the official PDF (and add page numbers when we have it).

export const KARTA_WZOROW: { section: string; contains: string }[] = [
  { section: 'Wartość bezwzględna liczby', contains: 'definicja |x|, własności, |x − a| ≤ r jako przedział, interpretacja jako odległość na osi' },
  { section: 'Potęgi i pierwiastki', contains: 'działania na potęgach o wykładniku całkowitym i wymiernym, pierwiastki' },
  { section: 'Logarytmy', contains: 'definicja logarytmu, logarytm iloczynu, ilorazu i potęgi, zamiana podstawy' },
  { section: 'Silnia. Współczynnik dwumianowy', contains: 'n!, symbol Newtona, wzór dwumianowy Newtona' },
  { section: 'Wzory skróconego mnożenia', contains: '(a ± b)², (a ± b)³, a² − b², a³ ± b³, aⁿ − bⁿ' },
  { section: 'Funkcja kwadratowa', contains: 'postać ogólna, kanoniczna i iloczynowa, współrzędne wierzchołka, wyróżnik Δ, wzory na pierwiastki, wzory Viète’a' },
  { section: 'Ciągi', contains: 'ciąg arytmetyczny (n-ty wyraz, suma), ciąg geometryczny (n-ty wyraz, suma), procent składany, szereg geometryczny zbieżny' },
  { section: 'Trygonometria', contains: 'definicje w trójkącie prostokątnym i w układzie współrzędnych, wartości dla 30°, 45°, 60°, jedynka trygonometryczna, tg, wzory redukcyjne, sinus i cosinus sumy i różnicy kątów, funkcje kąta podwojonego, sumy i różnice funkcji' },
  { section: 'Planimetria', contains: 'pola trójkątów (m.in. ze sinusem i wzór Herona), twierdzenie sinusów i cosinusów, Pitagoras, promienie okręgów wpisanego i opisanego, trójkąt równoboczny, czworokąty, koło, długość łuku i pole wycinka, kąty w okręgu, twierdzenie Talesa, podobieństwo' },
  { section: 'Geometria analityczna', contains: 'długość i środek odcinka, równanie prostej, proste równoległe i prostopadłe, odległość punktu od prostej, równanie okręgu, wektory' },
  { section: 'Stereometria', contains: 'pola powierzchni i objętości graniastosłupa, ostrosłupa, walca, stożka i kuli' },
  { section: 'Kombinatoryka', contains: 'wariacje z powtórzeniami i bez, permutacje, kombinacje' },
  { section: 'Rachunek prawdopodobieństwa', contains: 'prawdopodobieństwo klasyczne, własności, prawdopodobieństwo warunkowe, prawdopodobieństwo całkowite, schemat Bernoulliego' },
  { section: 'Parametry danych statystycznych', contains: 'średnia arytmetyczna i ważona, mediana, wariancja, odchylenie standardowe' },
  { section: 'Granica ciągu i pochodna funkcji', contains: 'granice ciągów, pochodne funkcji (suma, iloczyn, iloraz, złożenie), równanie stycznej do wykresu' },
];
