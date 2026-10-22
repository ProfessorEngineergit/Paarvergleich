# Paarvergleich – Priorisierung

Web-App, die bis zu 20 Items per paarweisem Vergleich in eine Reihenfolge bringt – für eine Einzelperson oder eine Gruppe. Läuft komplett im Browser (GitHub Pages), keine Daten verlassen das Gerät.

## Ablauf
1. **Modus**: Einzelperson oder Gruppe (mit Anzahl der Mitglieder für den Vollständigkeitscheck).
2. **Items**: bis zu 20 Zeilen `a`–`t`, jeweils mit Stichwort. Nur benannte Zeilen zählen. Eine Liste kann auch eingefügt werden.
3. **Vergleiche**: Einzelperson wählt je Paar ein Item – optional abgestuft („viel höher“, „höher“, „etwas höher“, Tasten 1–6). In der Gruppe wird die Stimmenzahl für ein Item eingegeben, die zweite errechnet die App aus der Gruppengröße.
4. **Ergebnis**: Bewertungsmatrix, Rangliste und Prioritätenskala, als PDF exportierbar.

Jede Entscheidung bzw. Stimme gibt dem priorisierten Item einen Punkt. Die Summe der Punkte ist die Priorität.

### Abgestuft (nur Einzelperson)
Ohne Abstufung ergibt die Rangfolge gleich große Abstände (0, 1, 2 …). Mit Abstufung wählt man zusätzlich, wie deutlich der Unterschied ist (1 = etwas höher, 2 = höher, 3 = viel höher). Die Fragen und ihre Reihenfolge bleiben identisch, die Reihenfolge wird weiter per Transitivität errechnet. Aus den Stufen entsteht eine Skala: Gesucht sind die Abstände zwischen benachbarten Rängen, die alle gegebenen Stufen im Mittel am besten treffen (kleinste Quadrate, Abstände nie negativ). Nicht gefragte Paare ergeben sich als Differenz der Skalenwerte. Der Skalenwert ersetzt die Punkte in Rangliste, Matrix, Prioritätenskala und PDF; das niedrigste Item hat den Wert 0.

## Weniger Fragen durch Ableitung
- **Einzelperson**: Binäres Einfügen und Transitivität (a > b und b > c ⇒ a > c). Bei 20 Items reichen meist ~60 statt 190 Fragen.
- **Gruppe (exakt)**: Unter der Annahme, dass jede Person in sich widerspruchsfrei urteilt, gilt: Mindestens `#(a>b) + #(b>c) − N` Personen stellen a vor c. Diese Schranken werden über alle Paare fortgeschrieben. Liegen Unter- und Obergrenze gleich, ist das Paar errechnet. Das klappt besonders bei großer Einigkeit. Die Fragen sind so angeordnet, dass möglichst viele Paare ableitbar werden.
- **Gruppe (Schnellmodus, optional)**: Mehrheiten werden transitiv übertragen (~60 Fragen bei 20 Items). Nicht gefragte Stimmenzahlen werden geschätzt und in Matrix und PDF mit `~` markiert.

Antworten lassen sich zurücknehmen. Der Stand wird lokal im Browser gespeichert und kann als JSON exportiert und wieder geladen werden.

## Dateien
- `index.html`, `style.css`, `app.js`: Oberfläche und PDF-Export (jsPDF)
- `engine.js`: Rechenkern (Ableitung, Fragestrategie, Rangliste, Abstandsskala)

Branding: Look an [tillnovotny.de](https://tillnovotny.de) angelehnt (Schrift Korpus Grotesk, helles Grau, schwarze Pillen-Buttons), Links im Seitenkopf, Footer und PDF. Farbpalette: Blau `#5980EF` als Hauptakzent, Grün `#4CB161`, Pink `#E94673` sowie die helleren Töne Hellgrün `#A4D8B0`, Hellpink `#F4A2B9`, Hellblau `#ADBFF7` und Gelb `#FFEE4A` (errechnete Paare = Hellblau, geschätzte = Gelb, Skalenwerte = Hellgrün). Die Schrift wird direkt von tillnovotny.de geladen. Browser erlauben das nur, wenn die Seite auf tillnovotny.de liegt oder der Server `Access-Control-Allow-Origin` sendet; sonst greift die Ersatzschrift (Helvetica/Arial). Schriftdateien sind bewusst nicht im Repo, da die Lizenz nicht geklärt ist.
