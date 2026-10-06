import 'server-only';
import { DrawingSpec } from '@teaching/shared';
import { AiError, geminiJson } from './gemini';

// "✨ Rysuj": the AI turns a request ("okrąg wpisany w czworokąt") into a drawing description.
// The geometry (tangency, inscribed circles, graphs) is computed by our code from that description
// (packages/shared/src/drawing.ts). The AI only draws: no solutions, no computed values.

const SYSTEM = `Zamieniasz prośbę nauczyciela matematyki na OPIS RYSUNKU w JSON. Nie rozwiązujesz zadań.

Zasady:
- NIE licz sam środków, promieni, punktów styczności ani przecięć: zawsze użyj konstrukcji ("incircle", "circumcircle", "tangent_circle", "tangents", "foot", "midpoint", "intersection"). Policzy je program, dokładnie. Sam podajesz tylko współrzędne wierzchołków i środki/promienie okręgów podanych w prośbie.
- Rysujesz tylko to, o co proszą. Nie dodajesz wyników, obliczeń ani długości, których nie podano w prośbie.
- Etykiety odcinków tylko z prośby (np. „3”, „a”, „2r”). Nazwy punktów: A, B, C… albo podane w prośbie.
- Współrzędne wybieraj ładne, w zakresie od −10 do 10, tak żeby rysunek był czytelny (nie płaski i nie zdegenerowany).
- Okrąg wpisany w czworokąt: wybierz czworokąt, w który da się wpisać okrąg (kwadrat, romb, deltoid albo trapez równoramienny z a+c=b+d), chyba że prośba mówi inaczej.
- Okrąg opisany na czworokącie: wybierz czworokąt wpisany w okrąg (prostokąt, kwadrat, trapez równoramienny).
- Styczne okręgi: użyj "tangent_circle". Styczne z punktu do okręgu: "tangents". Wysokość: "foot" + odcinek + "right_angle".
- Wykres funkcji: "axes" + "function" (wzór w zmiennej x, np. "x^2-4x+3", "2sin(x)", "sqrt(x+1)"). Zakres osi dobierz tak, żeby było widać ważne miejsca wykresu.
- Jeśli prośba nie jest o rysunek z matematyki, zwróć {"items": []}.

Format odpowiedzi: {"title": "krótki opis", "items": [ ... ]}. Elementy (pole "kind"):
- {"kind":"point","name":"A","x":0,"y":0,"hidden":false}
- {"kind":"midpoint","name":"M","of":["A","B"]}
- {"kind":"foot","name":"D","from":"C","line":["A","B"]}   (spodek prostopadłej z C na prostą AB)
- {"kind":"intersection","name":"S","line1":["A","C"],"line2":["B","D"]}
- {"kind":"segment","from":"A","to":"B","label":"5","dashed":false}
- {"kind":"polygon","points":["A","B","C","D"]}
- {"kind":"circle","name":"k","center":"O","radius":2}   albo   {"kind":"circle","center":"O","through":"A"}
- {"kind":"circumcircle","name":"k","of":["A","B","C"],"center":"O"}
- {"kind":"incircle","name":"k","of":["A","B","C","D"],"center":"O","touchPoints":["K","L","M","N"]}
- {"kind":"tangent_circle","name":"k2","to":"k1","radius":1,"angle":0,"external":true,"center":"O2"}   (angle w stopniach: kierunek od środka k1)
- {"kind":"tangents","from":"P","circle":"k","points":["T1","T2"]}
- {"kind":"right_angle","at":"D","a":"C","b":"B"}
- {"kind":"angle","at":"A","a":"B","b":"C","label":"α"}
- {"kind":"axes","x":[-3,6],"y":[-2,8]}
- {"kind":"function","expr":"x^2-4x+3","x":[-1,5],"label":"f"}
- {"kind":"label","at":"O","text":"r"}
Punkty muszą być zdefiniowane przed użyciem. Najwyżej 60 elementów.`;

/** The drawing description for a request, validated. Throws AiError ('not-understood' | 'not-math' | …). */
export async function drawingFor(request: string): Promise<DrawingSpec> {
  const { json } = await geminiJson({ system: SYSTEM, parts: [{ text: request }], temperature: 0.3 });
  const items = (json as { items?: unknown[] } | null)?.items;
  if (Array.isArray(items) && items.length === 0) throw new AiError('not-math');
  const parsed = DrawingSpec.safeParse(json);
  if (!parsed.success) throw new AiError('not-understood');
  return parsed.data;
}
