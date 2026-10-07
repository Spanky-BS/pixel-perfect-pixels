# Grobkosten: Stunden, Demontage und Entsorgung realistisch

## Was heute falsch läuft
1. **Jede Arbeit hat 1 h.** Die KI liefert oft keine Stunden, also setzt die App automatisch 1 h ein.
2. **Demontage-Arbeiten stehen unter «Arbeitsaufwand».** Alle Arbeiten landen dort, auch «Demontage 2 x WC-Anlagen».
3. **Demontage 850 und Entsorgung 350 sind immer gleich.** Sobald irgendwo «Demontage» vorkommt, setzt die App diese festen Pauschalen ein. Sie hängen nicht vom Umfang ab.

## Neu
1. **Realistische Stunden pro Arbeit**
   - Die KI muss jetzt für jede Arbeit eine fachliche Schätzung in Stunden abgeben, in 0.25-h-Schritten. Beispiele: WC demontieren ca. 0.75 h pro Stück, Heizkörper entleeren ca. 0.5 h.
   - Die Menge im Text zählt mit: «2 x WC» heisst doppelter Aufwand.
   - Fehlt trotzdem einmal eine Zahl, setzt die App 1 h ein. Diese Arbeit wird dann als «Stunden geschätzt – prüfen» markiert.
2. **Arbeiten in die richtige Rubrik**
   - Arbeiten mit Demontage, Rückbau, Abbruch, Entleeren oder Verzapfen kommen in **Demontage** (Stunden × Ansatz).
   - Arbeiten mit Entsorgung oder Abtransport kommen in **Entsorgung**.
   - Alles andere bleibt in **Arbeitsaufwand**, zum Beispiel Montage, Anschluss, Prüfung und Reinigung.
3. **Keine festen 850 / 350 mehr**
   - Demontage = Summe der erkannten Demontage-Arbeiten.
   - Die alte 850-Pauschale gilt nur noch als Ersatz: wenn Demontage erwähnt ist, aber keine einzige Demontage-Arbeit mit Stunden existiert.
   - Entsorgung = 40 CHF pro demontiertes Teil (aus den Mengen, z. B. «2 x WC» = 2), mindestens 150 CHF. Gibt es eine eigene Entsorgungs-Arbeit, wird diese verwendet.
   - Beim Aufklappen siehst du in jeder Rubrik die Herleitung, zum Beispiel «9 Teile × 40 CHF».

Wichtig: Für diese Baustelle musst du danach einmal «Mit aktuellem Material & Arbeit aktualisieren» drücken. Die bestehenden Stunden von 1 h bleiben, bis du sie anpasst oder neu auswerten lässt.

## Technische Details
- `src/lib/ai.functions.ts`: im Projekt-Prompt und Tool-Schema `stunden` als Pflichtfeld (required), Hinweis auf 0.25-h-Schritte und Menge berücksichtigen.
- `src/components/job/AiAnalysis.tsx`: Bei fehlenden Stunden 1 h setzen und den Vermerk «Stunden geschätzt – prüfen» in `notes` schreiben.
- `src/lib/price-guide.ts` `breakdownFromGuide`: Arbeit nach Stichwort der Rubrik zuordnen (Demontage / Entsorgung / Arbeitsaufwand). Die FLAT-Demontage nur noch als Ersatz verwenden. Entsorgung = max(150, 40 × Anzahl demontierter Teile), die Menge aus «N x» bzw. `quantity` lesen.
- Tests in `src/lib/price-guide.test.ts` anpassen bzw. ergänzen:
  - Demontage-Arbeit 2 h × 120 ergibt Demontage 240, nicht Arbeitsaufwand.
  - «Demontage 2 x WC» + «Demontage 1 x Pissoir» ergibt Entsorgung 150 (Minimum).
  - 5 Teile ergeben 200.
  - Die Pauschale 850 erscheint nur ohne Demontage-Stunden.
