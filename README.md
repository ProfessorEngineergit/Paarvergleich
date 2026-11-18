# Priorisierung

Web-App, die bis zu 20 Items per paarweisem Vergleich in eine Reihenfolge bringt - für eine Einzelperson, eine Gruppe oder als Wochenplanung. Die Vergleichslogik läuft im Browser (GitHub Pages); der Arbeitsstand wird lokal gespeichert. Die Seite lädt externe Ressourcen, darunter eine Schrift von tillnovotny.de. „Lokal“ bedeutet deshalb nicht, dass keinerlei Netzwerkverbindungen entstehen.

## Ablauf
1. **Modus**: Einzelperson, Gruppe (mit Anzahl der Mitglieder für den Vollständigkeitscheck) oder Wochenplanung (siehe unten).
2. **Items**: bis zu 20 Zeilen `a`-`t`, jeweils mit Stichwort. Nur benannte Zeilen zählen. Eine Liste kann auch eingefügt werden.
3. **Vergleiche**: Einzelperson wählt je Paar ein Item - optional abgestuft („viel höher“, „höher“, „etwas höher“, Tasten 1-6). In der Gruppe wird die Stimmenzahl für ein Item eingegeben, die zweite errechnet die App aus der Gruppengröße.
4. **Ergebnis**: Bewertungsmatrix, Rangliste und Prioritätenskala, als PDF exportierbar.

Jede Entscheidung bzw. Stimme gibt dem priorisierten Item einen Punkt. Die Summe der Punkte ist die Priorität.

### Abgestuft (nur Einzelperson)
Ohne Abstufung ergibt die Rangfolge gleich große Abstände (0, 1, 2 …). Mit Abstufung wählt man zusätzlich, wie deutlich der Unterschied ist (1 = etwas höher, 2 = höher, 3 = viel höher). Die Fragen und ihre Reihenfolge bleiben identisch, die Reihenfolge wird weiter per Transitivität errechnet. Aus den Stufen entsteht eine Skala: Gesucht sind die Abstände zwischen benachbarten Rängen, die alle gegebenen Stufen im Mittel am besten treffen (kleinste Quadrate, Abstände nie negativ). Nicht gefragte Paare ergeben sich als Differenz der Skalenwerte. Der Skalenwert ersetzt die Punkte in Rangliste, Matrix, Prioritätenskala und PDF; das niedrigste Item hat den Wert 0.

## Wochenplanung
Aktuelle Wochenplanung für berufliche und private Projekte (alles, was länger als eine halbe Stunde dauert und selbst disponiert wird).

1. **Projekte erfassen**: Woche und verfügbare Gesamtzeit in Stunden. Oben stehen die nicht erledigten Projekte der Vorwoche mit der Zahl ihrer Verschiebungen. Darunter neue Projekte (insgesamt max. 20) mit Stichwort, Dauer, kurzer Beschreibung und beruflich/privat; private Projekte erscheinen kursiv. Die Gesamtdauer läuft mit: grün unter 80 %, gelb ab 80 %, rot ab 100 % der verfügbaren Zeit. Jedes Projekt lässt sich ändern, verschieben oder streichen (und zurückholen).
2. **Vergleiche**: zwei Durchläufe im Modus Einzelperson, abgestuft - erst Wichtigkeit (relativer Nutzen für berufliche und private Werte), dann Dringlichkeit (relativer Schaden, wenn es nicht diese Woche geschieht).
3. **Ergebnis**: Je Dimension wird am Median in zwei Hälften geteilt (bei ungerader Anzahl kommt das mittlere Projekt zur Hälfte mit dem näheren Nachbarn). Daraus vier farbige Listen mit Dauer und Aktionen: 1 wichtig und dringlich (Magenta, Fokus), 2 dringlich (Blau, Notwendigkeit), 3 weder noch (Grau, Abwägung), 4 wichtig (Grün, Wert); je Bereich Hinweise unter „i“. Dazu eine Vier-Felder-Matrix, deren Positionen den Skalenwerten folgen (Beschreibung per Mouseover/Klick), sowie Rangliste, Skala und Bewertungsmatrix je Dimension und ein PDF.
4. **Projektstand** während der Woche: erledigt wie geplant, erledigt mit mehr Zeit, verschieben, streichen. Erledigte Projekte landen in der Tracking-Liste der letzten vier Wochen (mit mehr Zeit erledigte in Magenta, mit Zahl der Verschiebungen). „Neue Woche planen“ übernimmt offene und verschobene Projekte mit Verschiebung +1.

**Wertbereiche** (Gesundheit, Familie, Freunde, Erfolg, Entwicklung): Einmalig per abgestuftem Paarvergleich gewichten (max. 10 Fragen); die Gewichtung bleibt über die Wochen gespeichert und lässt sich neu erstellen. Gewicht = Skalenwert + 1, normiert auf 100 %, damit auch der niedrigste Bereich zählt. Projekte werden den Wertbereichen zugeordnet, auf die sie einzahlen; ihr Wertgewicht ist die Summe dieser Gewichte. Beim Vergleich der Wichtigkeit markiert die App einen Vorschlag, wenn beide Projekte zugeordnet sind und sich ihr Wertgewicht um mindestens 5 Prozentpunkte unterscheidet (ab 15 Punkten „wichtiger“, ab 30 „viel wichtiger“). Die Entscheidung bleibt bei der Person. Im Ergebnis und im PDF zeigt eine Bilanz je Wertbereich Gewicht und Anteil der geplanten Zeit (Stunden eines Projekts gleichmäßig auf seine Wertbereiche verteilt).

Projekte, die nach abgeschlossenen Vergleichen verschoben, gestrichen oder erledigt werden, bleiben in der Berechnung, damit die übrigen Positionen stabil bleiben. Die Daten der Wochenplanung liegen unter eigenem Schlüssel im Browser und sind im JSON-Export enthalten.

## Konto, Synchronisierung und Kurse (prio.coach)
- **Ohne Konto** funktioniert alles wie bisher, nur auf dem eigenen Gerät.
- **Anmeldung ohne Passwort:** E-Mail eingeben, Code aus der Mail eintippen. Das Konto wird dabei angelegt, die E-Mail ist damit bestätigt.
- **Synchronisierung:** Die App speichert sofort lokal und überträgt im Hintergrund ins Konto (Supabase, Region Frankfurt). Gewinnt der zuletzt bearbeitete Stand. Liegen bei der ersten Anmeldung auf einem Gerät abweichende Daten vor, fragt die App, welche gelten.
- **Nach der Anmeldung** geht es direkt in die App. Kurse und Freigaben liegen eingeklappt unter „Konto → Daten freigeben“.
- **Kurse:** Coaches legen unter „Konto → Eigene Kurse“ einen Kurs an und geben den Code (`PRIO-XXXX`) weiter. Beitritt und Teilen sind getrennt: Man kann ohne Teilen beitreten und das Teilen je Kurs jederzeit ein- und ausschalten. Nur bei eingeschaltetem Teilen werden Kennzahlen übertragen (Anzahl Projekte, geplante/verfügbare Stunden, erledigt, mit mehr Zeit, Verschiebungen, Anteil privat, Vergleiche). Projektnamen, Beschreibungen und Priorisierungen sieht die Kursleitung nicht; das erzwingt die Datenbank per Row Level Security.
- **Installierbar (PWA):** Manifest, Symbole und Service Worker; startet vom Startbildschirm und offline.
- Einrichtung der Datenbank und der E-Mail-Vorlagen: [`supabase/SETUP.md`](supabase/SETUP.md), Schema: [`supabase/schema.sql`](supabase/schema.sql).

## Weniger Fragen durch Ableitung
- **Einzelperson**: Binäres Einfügen und Transitivität (a > b und b > c ⇒ a > c). Bei 20 Items reichen meist ~60 statt 190 Fragen.
- **Gruppe (exakt)**: Unter der Annahme, dass jede Person in sich widerspruchsfrei urteilt, gilt: Mindestens `#(a>b) + #(b>c) − N` Personen stellen a vor c. Diese Schranken werden über alle Paare fortgeschrieben. Liegen Unter- und Obergrenze gleich, ist das Paar errechnet. Das klappt besonders bei großer Einigkeit. Die Fragen sind so angeordnet, dass möglichst viele Paare ableitbar werden.
- **Gruppe (Schnellmodus, optional)**: Mehrheiten werden transitiv übertragen (~60 Fragen bei 20 Items). Nicht gefragte Stimmenzahlen werden geschätzt und in Matrix und PDF mit `~` markiert.

Antworten lassen sich zurücknehmen. Der Stand wird lokal im Browser gespeichert und kann als JSON exportiert und wieder geladen werden.

## Dateien
- `index.html`, `style.css`, `app.js`: Oberfläche und PDF-Export (jsPDF)
- `week.js`: Wochenplanung
- `sync.js`: Konto, Synchronisierung, Kurse und Coach-Auswertung (Supabase)
- `sw.js`, `manifest.webmanifest`, `icons/`: installierbare App und Offline-Modus
- `impressum.html`, `datenschutz.html`: Rechtstexte
- `supabase/`: Datenbankschema und Einrichtung
- `engine.js`: Rechenkern (Ableitung, Fragestrategie, Rangliste, Abstandsskala)

Branding: Look an [tillnovotny.de](https://tillnovotny.de) angelehnt (Schrift Korpus Grotesk, helles Grau, schwarze Pillen-Buttons, Blau `#5a80ef` als Akzent). Darüber ein Glas-Design: halbtransparente Karten mit Hintergrund-Unschärfe und feiner, leicht transparenter grauer Glaskante mit Lichtkante oben, ein weicher pinker Lichtpunkt (`#e94673`), der je Schritt fließend an eine andere Stelle wandert, sowie kleine Animationen (Pfeile, Einblenden, Matrix). Bei „Bewegung reduzieren“ im System entfallen die Animationen, Links im Seitenkopf, Footer und PDF. Die Schrift wird direkt von tillnovotny.de geladen. Browser erlauben das nur, wenn die Seite auf tillnovotny.de liegt oder der Server `Access-Control-Allow-Origin` sendet; sonst greift die Ersatzschrift (Helvetica/Arial). Schriftdateien sind bewusst nicht im Repo, da die Lizenz nicht geklärt ist.

## KI-Beteiligung

Einzelne Code-Beiträge sind ausdrücklich KI-Tools zugeschrieben: [generated with Claude Code](https://github.com/ProfessorEngineergit/Paarvergleich/commit/209fac715cb354dc117eff4161254bc02e45b64b). Das gilt für diese Beiträge, nicht pauschal für alle Dateien.
