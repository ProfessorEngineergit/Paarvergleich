/*
 * Rechenkern für den Paarvergleich.
 *
 * Grundidee: L[i][j] ist die Mindestzahl an Personen, die Item i gegenüber Item j
 * priorisieren. Bei einer Einzelperson ist N = 1 und L ist 0 oder 1.
 * Ist eine Antwort bekannt, gilt L[i][j] = x und L[j][i] = N - x.
 *
 * Folgerung (unter der Annahme, dass jede einzelne Person in sich widerspruchsfrei
 * urteilt): Wer i vor k UND k vor j stellt, stellt auch i vor j. Davon gibt es
 * mindestens L[i][k] + L[k][j] - N Personen. Für N = 1 ist das genau die Regel
 * „a vor b und b vor c ⇒ a vor c“.
 * Ein Paar gilt als bestimmt, wenn L[i][j] + L[j][i] = N.
 */
(function (global) {
  'use strict';

  function matrix(n, v) {
    const m = [];
    for (let i = 0; i < n; i++) m.push(new Array(n).fill(v));
    return m;
  }

  function copy(L) { return L.map(r => r.slice()); }

  // Floyd-Warshall im (max,+)-Halbring: Kantengewicht L - N ist <= 0, also keine positiven Zyklen.
  function closure(L, N) {
    const n = L.length;
    for (let k = 0; k < n; k++) {
      const Lk = L[k];
      for (let i = 0; i < n; i++) {
        if (i === k) continue;
        const lik = L[i][k];
        if (lik === 0) continue;
        const Li = L[i];
        for (let j = 0; j < n; j++) {
          if (j === i || j === k) continue;
          const v = lik + Lk[j] - N;
          if (v > Li[j]) Li[j] = v;
        }
      }
    }
    return L;
  }

  function countDetermined(L, N) {
    let c = 0, w = 0;
    const n = L.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const gap = N - L[i][j] - L[j][i];
      if (gap === 0) c++; else w += gap;
    }
    return { determined: c, width: w };
  }

  /**
   * items: [{letter, label}], answers: [{a, b, x}] (x = Stimmen für a gegenüber b),
   * N: Anzahl Personen (1 bei Einzelperson), fast: Mehrheiten transitiv übertragen.
   */
  function analyze(items, answers, N, fast) {
    const n = items.length;
    const idx = {};
    items.forEach((o, k) => { idx[o.letter] = k; });
    const L = matrix(n, 0);
    const asked = matrix(n, false);
    const askedCount = new Array(n).fill(0);
    let used = 0;
    for (const a of answers) {
      const i = idx[a.a], j = idx[a.b];
      if (i == null || j == null || i === j) continue;
      L[i][j] = a.x; L[j][i] = N - a.x;
      asked[i][j] = asked[j][i] = true;
      askedCount[i]++; askedCount[j]++;
      used++;
    }
    closure(L, N);

    const known = matrix(n, false);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i !== j && L[i][j] + L[j][i] === N) known[i][j] = true;
    }

    // Gesicherte Mehrheiten (Untergrenze > N/2), im Schnellmodus transitiv fortgeschrieben.
    let maj = null;
    if (fast) {
      maj = matrix(n, false);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i !== j && 2 * L[i][j] > N) maj[i][j] = true;
      }
      for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
        if (!maj[i][k]) continue;
        for (let j = 0; j < n; j++) if (j !== i && maj[k][j]) maj[i][j] = true;
      }
    }

    const A = { n, N, L, asked, askedCount, known, maj, fast, used, items };
    A.next = nextQuestion(A);
    A.complete = !A.next;

    // Werte je Zelle: Stimmen für Zeilen-Item gegenüber Spalten-Item.
    const X = matrix(n, null);
    const status = matrix(n, null); // 'asked' | 'inferred' | 'estimated' | 'open'
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (known[i][j]) {
        X[i][j] = L[i][j];
        status[i][j] = asked[i][j] ? 'asked' : 'inferred';
      } else if (fast && A.complete) {
        if (i < j) {
          const e = estimate(A, i, j);
          X[i][j] = e; X[j][i] = N - e;
          status[i][j] = status[j][i] = 'estimated';
        }
      } else {
        status[i][j] = 'open';
      }
    }
    A.X = X; A.status = status;

    const points = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (X[i][j] != null) points[i] += X[i][j];
    A.points = points;

    let cAsked = 0, cInf = 0, cEst = 0, cOpen = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const s = status[i][j];
      if (s === 'asked') cAsked++; else if (s === 'inferred') cInf++; else if (s === 'estimated') cEst++; else cOpen++;
    }
    A.counts = { pairs: n * (n - 1) / 2, asked: cAsked, inferred: cInf, estimated: cEst, open: cOpen };
    return A;
  }

  // Schätzwert für ein nicht gefragtes Paar im Schnellmodus: Mitte des zulässigen Bereichs,
  // eingeschränkt auf die (transitiv angenommene) Mehrheit.
  function estimate(A, i, j) {
    const { L, N, maj } = A;
    let lo = L[i][j], hi = N - L[j][i];
    const half = Math.floor(N / 2) + 1;
    if (maj[i][j] && !maj[j][i]) lo = Math.max(lo, Math.min(half, hi));
    else if (maj[j][i] && !maj[i][j]) hi = Math.min(hi, Math.max(N - half, lo));
    return Math.round((lo + hi) / 2);
  }

  function nextQuestion(A) {
    if (A.n < 2) return null;
    if (A.N === 1) {
      return insertion(A, (k, m) => A.L[k][m] === 1 ? 1 : A.L[m][k] === 1 ? -1 : 0);
    }
    if (A.fast) {
      return insertion(A, (k, m) => {
        if (A.maj[k][m] && !A.maj[m][k]) return 1;
        if (A.maj[m][k] && !A.maj[k][m]) return -1;
        if (A.known[k][m]) return A.L[k][m] * 2 > A.N ? 1 : -1;
        return 0;
      });
    }
    // Gruppe (exakt): zuerst per binärem Einfügen die Mehrheitsreihenfolge ermitteln –
    // bei einiger Einigkeit liefert das die meisten Ableitungen. Danach gezielt Restpaare.
    return insertion(A, (k, m) => {
      if (2 * A.L[k][m] > A.N) return 1;
      if (2 * A.L[m][k] >= A.N) return -1;
      return 0;
    }) || greedy(A);
  }

  // Binäres Einfügen: jedes neue Item wird per Halbierung in die bisherige Rangfolge
  // einsortiert. Bekannte (auch errechnete) Relationen werden nicht erneut gefragt.
  function insertion(A, cmp) {
    const sorted = [0];
    for (let k = 1; k < A.n; k++) {
      let lo = 0, hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1, m = sorted[mid];
        const c = cmp(k, m);
        if (c === 0) return order(A, m, k);
        if (c > 0) hi = mid; else lo = mid + 1;
      }
      sorted.splice(lo, 0, k);
    }
    return null;
  }

  // Gruppe (exakt): Wähle das Paar, dessen Antwort voraussichtlich die meisten anderen
  // Paare bestimmt bzw. deren zulässige Bereiche am stärksten einengt.
  function greedy(A) {
    const { n, N, L, askedCount } = A;
    const base = countDetermined(L, N);
    let best = null;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (A.known[i][j]) continue;
      const lo = L[i][j], hi = N - L[j][i];
      const vals = Array.from(new Set([lo, hi, Math.round((lo + hi) / 2)]));
      let score = 0;
      for (const v of vals) {
        const C = copy(L);
        C[i][j] = v; C[j][i] = N - v;
        closure(C, N);
        const r = countDetermined(C, N);
        score += (r.determined - base.determined - 1) * 1000 + (base.width - (hi - lo) - r.width);
      }
      score /= vals.length;
      const spread = askedCount[i] + askedCount[j];
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && spread < best.spread)) {
        best = { score, spread, i, j };
      }
    }
    return best ? order(A, best.i, best.j) : null;
  }

  function order(A, i, j) {
    const a = Math.min(i, j), b = Math.max(i, j);
    return { i: a, j: b, lo: A.L[a][b], hi: A.N - A.L[b][a] };
  }

  // Rangliste: absteigend nach Punkten, gleiche Punkte = gleicher Rang.
  function ranking(A) {
    const rows = A.items.map((o, k) => ({ k, letter: o.letter, label: o.label, points: A.points[k] }));
    rows.sort((p, q) => q.points - p.points || p.letter.localeCompare(q.letter));
    let prev = null, rank = 0;
    rows.forEach((r, pos) => {
      if (prev === null || r.points !== prev.points) rank = pos + 1;
      r.rank = rank;
      r.gap = prev === null ? null : prev.points - r.points;
      prev = r;
    });
    return rows;
  }

  global.PV = { analyze, ranking, closure, matrix };
})(typeof window !== 'undefined' ? window : globalThis);
