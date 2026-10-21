(function () {
  'use strict';

  const LETTERS = 'abcdefghijklmnopqrst'.split('');
  const KEY = 'paarvergleich-v1';
  const $ = id => document.getElementById(id);

  const fresh = () => ({ step: 1, mode: null, groupSize: 5, fast: false, graded: true, title: '', labels: Array(20).fill(''), answers: [] });
  let S = load() || fresh();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return sanitize(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ohne Speicher weiterarbeiten */ }
  }
  function sanitize(o) {
    const s = fresh();
    if (!o || typeof o !== 'object') return s;
    s.step = [1, 2, 3, 4].includes(o.step) ? o.step : 1;
    s.mode = o.mode === 'single' || o.mode === 'group' ? o.mode : null;
    s.groupSize = Math.max(2, Math.min(500, parseInt(o.groupSize, 10) || 5));
    s.fast = !!o.fast;
    // Ältere Sitzungen ohne Stufen bleiben unverändert, sofern schon Antworten vorliegen.
    s.graded = o.graded === undefined ? !(Array.isArray(o.answers) && o.answers.length) : !!o.graded;
    s.title = typeof o.title === 'string' ? o.title.slice(0, 120) : '';
    if (Array.isArray(o.labels)) for (let i = 0; i < 20; i++) s.labels[i] = typeof o.labels[i] === 'string' ? o.labels[i].slice(0, 80) : '';
    if (Array.isArray(o.answers)) s.answers = o.answers.filter(a => a && LETTERS.includes(a.a) && LETTERS.includes(a.b) && Number.isInteger(a.x))
      .map(a => ({ a: a.a, b: a.b, x: a.x, ...([1, 2, 3].includes(a.g) ? { g: a.g } : {}) }));
    if (!s.mode && s.step > 1) s.step = 1;
    return s;
  }

  const N = () => S.mode === 'group' ? S.groupSize : 1;
  const items = () => S.labels.map((l, i) => ({ letter: LETTERS[i], label: l.trim() })).filter(o => o.label);
  const isGraded = () => S.mode === 'single' && S.graded;
  const analysis = () => PV.analyze(items(), S.answers, N(), S.mode === 'group' && S.fast, isGraded());
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const modeText = () => S.mode === 'group' ? `Gruppe mit ${S.groupSize} Personen${S.fast ? ' (Schnellmodus)' : ''}` : `Einzelperson${S.graded ? ' (abgestuft)' : ''}`;
  const GRADES = { 3: 'viel höher', 2: 'höher', 1: 'etwas höher' };

  function go(step) { S.step = step; save(); render(); window.scrollTo(0, 0); }

  function render() {
    document.querySelectorAll('.step').forEach(el => { el.hidden = el.id !== 'step' + S.step; });
    document.querySelectorAll('#steps li').forEach(li => {
      const n = +li.dataset.step;
      li.classList.toggle('active', n === S.step);
      li.classList.toggle('done', n < S.step);
    });
    if (S.step === 1) renderStep1();
    if (S.step === 2) renderStep2();
    if (S.step === 3) renderStep3();
    if (S.step === 4) renderStep4();
  }

  // ---------- Schritt 1 ----------
  function renderStep1() {
    document.querySelectorAll('input[name=mode]').forEach(r => { r.checked = r.value === S.mode; });
    $('groupOpts').hidden = S.mode !== 'group';
    $('singleOpts').hidden = S.mode !== 'single';
    $('graded').checked = S.graded;
    $('groupSize').value = S.groupSize;
    $('fastMode').checked = S.fast;
    $('title').value = S.title;
    $('toStep2').disabled = !S.mode;
  }
  function settingsChange(apply) {
    const before = JSON.stringify([S.mode, S.groupSize, S.fast, S.graded]);
    const prev = { mode: S.mode, groupSize: S.groupSize, fast: S.fast, graded: S.graded };
    apply();
    const changed = before !== JSON.stringify([S.mode, S.groupSize, S.fast, S.graded]);
    if (changed && S.answers.length) {
      if (!confirm('Die bisherigen Antworten passen nicht mehr zu dieser Einstellung und werden verworfen. Fortfahren?')) {
        Object.assign(S, prev); renderStep1(); return;
      }
      S.answers = [];
    }
    save(); renderStep1();
  }
  document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => settingsChange(() => { S.mode = r.value; })));
  $('groupSize').addEventListener('change', e => settingsChange(() => { S.groupSize = Math.max(2, Math.min(500, parseInt(e.target.value, 10) || 2)); }));
  $('fastMode').addEventListener('change', e => settingsChange(() => { S.fast = e.target.checked; }));
  $('graded').addEventListener('change', e => settingsChange(() => { S.graded = e.target.checked; }));
  $('title').addEventListener('input', e => { S.title = e.target.value; save(); });
  $('toStep2').addEventListener('click', () => { if (S.mode) go(2); });

  // ---------- Schritt 2 ----------
  let labelsAtEntry = null;
  function renderStep2() {
    const box = $('itemRows');
    if (!box.children.length) {
      box.innerHTML = LETTERS.map((l, i) =>
        `<label class="item-row"><span class="ltr">${l}</span><input type="text" maxlength="80" data-i="${i}" placeholder="Stichwort"></label>`).join('');
      box.addEventListener('input', e => {
        const i = e.target.dataset.i;
        if (i == null) return;
        S.labels[+i] = e.target.value; save(); itemInfo();
      });
    }
    box.querySelectorAll('input').forEach(inp => { inp.value = S.labels[+inp.dataset.i]; });
    labelsAtEntry = JSON.stringify(items());
    itemInfo();
  }
  function itemInfo() {
    const n = items().length;
    const pairs = n * (n - 1) / 2;
    $('itemInfo').textContent = n < 2
      ? 'Mindestens zwei Items mit Stichwort erfassen.'
      : `${n} Items · ${pairs} mögliche Paare. Durch Ableitung werden davon meist deutlich weniger abgefragt.`;
    $('toStep3').disabled = n < 2;
  }
  $('pasteBtn').addEventListener('click', () => {
    const lines = $('pasteArea').value.split(/\r?\n/);
    const labels = Array(20).fill('');
    let pos = 0;
    for (const line of lines) {
      if (pos >= 20 && !/^\s*[a-t][\).:]\s+/i.test(line)) break;
      const m = line.match(/^\s*([a-t])[\).:]\s+(.*)$/i);
      if (m) { const i = LETTERS.indexOf(m[1].toLowerCase()); labels[i] = m[2].trim().slice(0, 80); pos = i + 1; }
      else { if (pos < 20) labels[pos] = line.trim().slice(0, 80); pos++; }
    }
    S.labels = labels; save(); renderStep2();
    $('pasteArea').value = '';
    $('pasteArea').closest('details').open = false;
  });
  $('back1').addEventListener('click', () => go(1));
  $('toStep3').addEventListener('click', () => {
    if (S.answers.length && labelsAtEntry !== JSON.stringify(items())) {
      // Antworten zu entfernten Items werden ignoriert; geänderte Stichwörter behalten ihre Antworten.
      const letters = new Set(items().map(o => o.letter));
      S.answers = S.answers.filter(a => letters.has(a.a) && letters.has(a.b));
    }
    go(3);
  });

  // ---------- Schritt 3 ----------
  function renderStep3() {
    const A = analysis();
    if (A.complete) { go(4); return; }
    const c = A.counts;
    const settled = c.asked + c.inferred;
    $('progBar').style.width = (100 * settled / c.pairs) + '%';
    $('progText').textContent = `Frage ${S.answers.length + 1} · ${settled} von ${c.pairs} Paaren bestimmt (${c.asked} gefragt, ${c.inferred} errechnet)`;
    $('undoBtn').disabled = !S.answers.length;
    const q = A.next, a = A.items[q.i], b = A.items[q.j];
    const box = $('question');
    if (isGraded()) {
      const side = (it, order) => `<div class="gcol"><div class="gitem"><span class="ltr">${it.letter}</span>${esc(it.label)}</div><div class="gbtns">` +
        order.map((g, k) => `<button class="gpick s${g}" data-it="${it.letter}" data-g="${g}"><span>${GRADES[g]}</span><kbd>${(it === a ? 0 : 3) + k + 1}</kbd></button>`).join('') + '</div></div>';
      box.innerHTML = `
        <p class="q-title">Welches Item hat die höhere Priorität – und wie viel höher?</p>
        <div class="gduel">${side(a, [3, 2, 1])}${side(b, [1, 2, 3])}</div>
        <p class="hint">Ein Klick genügt (Tasten 1–6). Die Reihenfolge wird weiterhin errechnet; die Stufen bestimmen die Abstände auf der Skala.</p>`;
      box.querySelectorAll('.gpick').forEach(btn => btn.addEventListener('click', () => {
        const g = +btn.dataset.g;
        answer(a, b, btn.dataset.it === a.letter ? 1 : 0, g);
      }));
    } else if (S.mode === 'single') {
      box.innerHTML = `
        <p class="q-title">Welches Item hat die höhere Priorität?</p>
        <div class="duel">
          <button class="pick" data-x="1"><span class="ltr">${a.letter}</span>${esc(a.label)}<kbd>Taste 1 / ←</kbd></button>
          <span class="vs">oder</span>
          <button class="pick" data-x="0"><span class="ltr">${b.letter}</span>${esc(b.label)}<kbd>Taste 2 / →</kbd></button>
        </div>`;
      box.querySelectorAll('.pick').forEach(btn => btn.addEventListener('click', () => answer(a, b, +btn.dataset.x)));
    } else {
      const fixed = q.lo === q.hi;
      box.innerHTML = `
        <p class="q-title">Wie viele der ${S.groupSize} Personen entscheiden sich für welches Item?</p>
        <div class="duel">
          <div class="vote"><span class="ltr">${a.letter}</span><span>${esc(a.label)}</span><input type="number" id="va" min="${q.lo}" max="${q.hi}" inputmode="numeric" aria-label="Stimmen für ${a.letter}"></div>
          <span class="vs">oder</span>
          <div class="vote"><span class="ltr">${b.letter}</span><span>${esc(b.label)}</span><input type="number" id="vb" min="${S.groupSize - q.hi}" max="${S.groupSize - q.lo}" inputmode="numeric" aria-label="Stimmen für ${b.letter}"></div>
        </div>
        <p class="hint">Eine Zahl eingeben, die zweite wird aus der Gruppengröße errechnet.${(q.lo > 0 || q.hi < S.groupSize) && !fixed ? `<br>Aus den bisherigen Antworten folgt: ${q.lo} bis ${q.hi} Stimmen für ${a.letter}.` : ''}</p>
        <p class="err" id="verr"></p>
        <p class="center"><button class="primary" id="vok">Übernehmen (Enter)</button></p>`;
      const va = $('va'), vb = $('vb');
      const sync = (src, dst) => {
        const v = parseInt(src.value, 10);
        dst.value = Number.isFinite(v) ? S.groupSize - v : '';
        validate();
      };
      const validate = () => {
        const v = parseInt(va.value, 10);
        let msg = '';
        if (va.value !== '' && !Number.isFinite(v)) msg = 'Bitte eine ganze Zahl eingeben.';
        else if (Number.isFinite(v) && (v < 0 || v > S.groupSize)) msg = `Die Stimmen müssen zwischen 0 und ${S.groupSize} liegen.`;
        else if (Number.isFinite(v) && (v < q.lo || v > q.hi)) msg = `Nach den bisherigen Antworten sind für ${a.letter} nur ${q.lo} bis ${q.hi} Stimmen möglich (sonst hätte mindestens eine Person widersprüchlich geurteilt). Bitte Eingabe prüfen oder eine frühere Antwort zurücknehmen.`;
        $('verr').textContent = msg;
        $('vok').disabled = !Number.isFinite(v) || !!msg;
        return !msg && Number.isFinite(v);
      };
      va.addEventListener('input', () => sync(va, vb));
      vb.addEventListener('input', () => sync(vb, va));
      const submit = () => { if (validate()) answer(a, b, parseInt(va.value, 10)); };
      [va, vb].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));
      $('vok').addEventListener('click', submit);
      validate();
      va.focus();
    }
  }
  function answer(a, b, x, g) {
    S.answers.push(g ? { a: a.letter, b: b.letter, x, g } : { a: a.letter, b: b.letter, x });
    save(); render();
  }
  document.addEventListener('keydown', e => {
    if (S.step !== 3 || S.mode !== 'single' || e.target.tagName === 'INPUT') return;
    const gb = document.querySelectorAll('#question .gpick');
    const btns = document.querySelectorAll('#question .pick');
    if (gb.length === 6 && /^[1-6]$/.test(e.key)) gb[+e.key - 1].click();
    else if (btns.length === 2) {
      if (e.key === '1' || e.key === 'ArrowLeft') btns[0].click();
      if (e.key === '2' || e.key === 'ArrowRight') btns[1].click();
    }
    if ((e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) && S.answers.length) { e.preventDefault(); undo(); }
  });
  function undo() { if (S.answers.length) { S.answers.pop(); save(); if (S.step !== 3) go(3); else render(); } }
  $('undoBtn').addEventListener('click', undo);
  $('back2').addEventListener('click', () => go(2));

  // ---------- Schritt 4 ----------
  function renderStep4() {
    const A = analysis();
    if (!A.complete) { go(3); return; }
    const rows = PV.ranking(A);
    const maxPts = A.maxPts, axisMax = Math.max(1, Math.ceil(maxPts));
    const ptsName = A.graded ? 'Skalenwert' : 'Punkte';
    $('resTitle').textContent = S.title.trim() || 'Ergebnis';

    const c = A.counts;
    const sumOk = A.graded || A.points.reduce((s, p) => s + p, 0) === c.pairs * A.N;
    const complete = c.open === 0 && sumOk;
    const kpi = (v, t) => `<div class="kpi"><b>${v}</b>${t}</div>`;
    $('checkBox').innerHTML =
      `<div class="kpi"><b class="mode">${modeText()}</b>Modus</div>` + kpi(A.n, 'Items') + kpi(c.pairs, 'Paare') +
      kpi(c.asked, 'gefragt') + kpi(c.inferred, 'errechnet') +
      (c.estimated ? kpi(c.estimated, 'geschätzt') : '') +
      `<div class="status ${complete ? 'ok' : 'warn'}">${complete
        ? (A.graded
          ? `Vollständigkeitscheck bestanden: Alle ${c.pairs} Paare bewertet, Reihenfolge widerspruchsfrei. Die Skala weicht im Mittel um ${fmt(Math.round(A.fitDev * 10) / 10)} Stufen von Deinen Angaben ab.`
          : `Vollständigkeitscheck bestanden: Alle ${c.pairs} Paare bewertet, je Paar ${A.N} ${A.N === 1 ? 'Punkt' : 'Stimmen'}, Gesamtsumme ${c.pairs * A.N} Punkte.`)
        : `Vollständigkeitscheck nicht bestanden: ${c.open} Paare offen.`}
        ${c.asked < c.pairs ? ` Ersparnis: ${c.pairs - c.asked} von ${c.pairs} Fragen (${Math.round(100 * (c.pairs - c.asked) / c.pairs)} %).` : ''}</div>`;

    $('rankTable').innerHTML = `<thead><tr><th>Rang</th><th>Item</th><th>Stichwort</th><th class="num">${ptsName}</th><th class="num">Anteil</th><th class="num">Abstand</th><th></th></tr></thead><tbody>` +
      rows.map(r => `<tr><td>${r.rank}.</td><td><b>${r.letter}</b></td><td class="kw">${esc(r.label)}</td><td class="num">${fmt(r.points)}</td><td class="num">${pct(r.points, maxPts)}</td><td class="num">${r.gap === null ? '–' : fmt(r.gap)}</td><td class="barcell"><div class="bar" style="width:${maxPts ? 100 * r.points / maxPts : 0}%"></div></td></tr>`).join('') + '</tbody>';

    $('matrixLegend').innerHTML = (A.graded
      ? 'Zelle = Abstand des Zeilen-Items zum Spalten-Item in Stufen (1 = etwas höher, 2 = höher, 3 = viel höher; Minus = niedriger). Gefragte Paare zeigen die gegebene Stufe, errechnete Paare die Differenz der Skalenwerte. Skalenwert: niedrigstes Item = 0.'
      : `Zelle = ${A.N === 1 ? 'Punkt' : 'Stimmen'} des Zeilen-Items im Vergleich mit dem Spalten-Item; Zeilensumme = Priorität.`) +
      `<span class="swatch"></span>gefragt<span class="swatch" style="background:var(--inferred)"></span>errechnet` +
      (c.estimated ? `<span class="swatch" style="background:var(--estimated)"></span>geschätzt (~)` : '');
    let h = '<thead><tr><th></th>' + A.items.map(o => `<th>${o.letter}</th>`).join('') + `<th>${A.graded ? 'Skalenwert' : 'Summe'}</th></tr></thead><tbody>`;
    A.items.forEach((o, i) => {
      h += `<tr><th class="rowh" title="${esc(o.label)}">${o.letter} · ${esc(o.label)}</th>`;
      A.items.forEach((_, j) => {
        if (i === j) { h += '<td class="diag"></td>'; return; }
        const st = A.status[i][j];
        h += `<td class="${st}">${st === 'estimated' ? '~' : ''}${A.graded ? sgn(A.X[i][j]) : A.X[i][j]}</td>`;
      });
      h += `<td class="sum">${fmt(A.points[i])}</td></tr>`;
    });
    $('matrix').innerHTML = h + '</tbody>';

    $('scaleNote').textContent = `Position = ${ptsName === 'Punkte' ? 'Punktzahl' : 'Skalenwert'}. So sind die Abstände zwischen den Items direkt zu sehen.`;
    $('scale').innerHTML = scaleSvg(rows, axisMax);
  }
  // Ganze Zahlen unverändert, sonst eine Nachkommastelle mit Komma.
  const fmt = v => String(Math.round(v * 10) / 10).replace('.', ',');
  const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));
  const pct = (v, max) => max ? Math.round(100 * v / max) + ' %' : '–';

  // Beschriftungen auf Ebenen verteilen, damit sie sich nicht überlappen.
  function layoutLabels(rows, maxPts, x0, width, textWidth, pad) {
    const list = rows.map(r => ({ r, x: x0 + (maxPts ? r.points / maxPts : 0) * width, w: textWidth(scaleLabel(r)) }))
      .sort((p, q) => p.x - q.x);
    const ends = [];
    for (const it of list) {
      let left = Math.min(Math.max(it.x - it.w / 2, x0 - 20), x0 + width + 20 - it.w);
      let lvl = ends.findIndex(e => e + pad <= left);
      if (lvl < 0) { lvl = ends.length; ends.push(0); }
      ends[lvl] = left + it.w;
      it.left = left; it.level = lvl;
    }
    return { list, levels: ends.length };
  }
  const shorten = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const scaleLabel = r => `${r.letter} · ${shorten(r.label, 26)} (${fmt(r.points)})`;
  function ticks(maxPts) {
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find(s => maxPts / s <= 12) || 10000;
    const t = [];
    for (let v = 0; v <= maxPts; v += step) t.push(v);
    if (t[t.length - 1] !== maxPts) t.push(maxPts);
    return t;
  }
  function scaleSvg(rows, maxPts) {
    const W = 900, x0 = 40, width = W - 80, lh = 20;
    const { list, levels } = layoutLabels(rows, maxPts, x0, width, s => s.length * 6.6, 8);
    const axisY = 30 + levels * lh + 14;
    const H = axisY + 50;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Prioritätenskala">`;
    const ty = it => 30 + (levels - 1 - it.level) * lh;
    for (const it of list) s += `<line class="lead" x1="${it.x}" y1="${ty(it) + 4}" x2="${it.x}" y2="${axisY}" />`;
    for (const it of list) {
      s += `<rect class="lbg" x="${it.left - 2}" y="${ty(it) - 12}" width="${it.w + 4}" height="16" rx="3"/>`;
      s += `<text x="${it.left}" y="${ty(it)}">${esc(scaleLabel(it.r))}</text>`;
    }
    s += `<line class="axis" x1="${x0}" y1="${axisY}" x2="${x0 + width}" y2="${axisY}" stroke-width="1.5"/>`;
    for (const t of ticks(maxPts)) {
      const x = x0 + (maxPts ? t / maxPts : 0) * width;
      s += `<line class="axis" x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 5}"/><text class="tick" x="${x}" y="${axisY + 18}" text-anchor="middle">${t}</text>`;
    }
    // Abstände zwischen aufeinanderfolgenden Rängen unter der Achse
    const uniq = [...new Set(rows.map(r => r.points))].sort((a, b) => a - b);
    for (let k = 1; k < uniq.length; k++) {
      const xa = x0 + uniq[k - 1] / maxPts * width, xb = x0 + uniq[k] / maxPts * width;
      if (xb - xa >= 18) s += `<text class="gap" x="${(xa + xb) / 2}" y="${axisY + 36}" text-anchor="middle">+${fmt(uniq[k] - uniq[k - 1])}</text>`;
    }
    for (const it of list) s += `<circle class="dot" cx="${it.x}" cy="${axisY}" r="5"/>`;
    return s + '</svg>';
  }

  $('back3').addEventListener('click', () => {
    if (S.answers.length && confirm('Letzte Antwort zurücknehmen, um sie zu korrigieren?')) undo();
  });

  // ---------- PDF ----------
  $('pdfBtn').addEventListener('click', () => {
    if (!window.jspdf) { alert('Die PDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.'); return; }
    makePdf(analysis());
  });

  function pdfText(s) { return String(s).replace(/…/g, '...').replace(/[−–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF€]/g, '?'); }

  function makePdf(A) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const PW = 297, PH = 210, M = 12;
    const rows = PV.ranking(A);
    const maxPts = A.maxPts, axisMax = Math.max(1, Math.ceil(maxPts));
    const ptsName = A.graded ? 'Skalenwert' : 'Punkte';
    const c = A.counts;
    const title = pdfText(S.title.trim() || 'Priorisierung per Paarvergleich');
    const date = new Date().toLocaleDateString('de-DE');
    const accent = [90, 128, 239], accentInk = [58, 95, 208];
    let page = 0;

    const header = sub => {
      if (page++) doc.addPage();
      doc.setFillColor(...accent); doc.rect(0, 0, PW, 3, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(28, 36, 48);
      doc.text(title, M, 13);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(93, 104, 119);
      doc.text(pdfText(`${sub}  ·  ${modeText()}  ·  ${A.n} Items  ·  ${date}`), M, 19);
      const pg = `Seite ${page}`;
    doc.text(pg, PW - M, PH - 6, { align: 'right' });
    const link = 'tillnovotny.de';
    const xr = PW - M - doc.getTextWidth(pg) - 6;
    doc.setTextColor(...accentInk);
    doc.textWithLink(link, xr - doc.getTextWidth(link), PH - 6, { url: 'https://tillnovotny.de' });
    doc.setFont('helvetica', 'bold'); doc.setTextColor(28, 36, 48);
    doc.text('TILL NOVOTNY', xr - doc.getTextWidth(link) - 3, PH - 6, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setTextColor(93, 104, 119);
      doc.text(pdfText(`Paare: ${c.pairs} · gefragt: ${c.asked} · errechnet: ${c.inferred}${c.estimated ? ' · geschätzt: ' + c.estimated : ''} · Vollständigkeitscheck: ${c.open === 0 ? 'bestanden' : c.open + ' offen'}`), M, PH - 6);
      doc.setTextColor(28, 36, 48);
    };

    // Seite 1: Matrix
    header('Bewertungsmatrix');
    const labelW = 58;
    const cols = A.n + 1;
    const cw = Math.min(14, (PW - 2 * M - labelW) / cols);
    const rh = Math.min(8, (PH - 50) / (A.n + 1));
    let y = 26;
    const x0 = M;
    doc.setFontSize(Math.min(9, rh * 1.5));
    doc.setFont('helvetica', 'bold');
    A.items.forEach((o, j) => doc.text(o.letter, x0 + labelW + j * cw + cw / 2, y + rh * 0.68, { align: 'center' }));
    doc.text(A.graded ? 'Wert' : 'Summe', x0 + labelW + A.n * cw + cw / 2, y + rh * 0.68, { align: 'center' });
    y += rh;
    A.items.forEach((o, i) => {
      doc.setFont('helvetica', 'bold');
      doc.text(o.letter, x0 + 1.5, y + rh * 0.68);
      doc.setFont('helvetica', 'normal');
      let lab = pdfText(o.label);
      while (doc.getTextWidth(lab) > labelW - 8 && lab.length > 3) lab = lab.slice(0, -4) + '...';
      doc.text(lab, x0 + 6, y + rh * 0.68);
      A.items.forEach((_, j) => {
        const cx = x0 + labelW + j * cw;
        const st = A.status[i][j];
        if (i === j) doc.setFillColor(205, 210, 217);
        else if (st === 'inferred') doc.setFillColor(227, 238, 252);
        else if (st === 'estimated') doc.setFillColor(253, 241, 216);
        else doc.setFillColor(255, 255, 255);
        doc.setDrawColor(200, 206, 214);
        doc.rect(cx, y, cw, rh, 'FD');
        if (i !== j) doc.text(pdfText((st === 'estimated' ? '~' : '') + (A.graded ? sgn(A.X[i][j]) : A.X[i][j])), cx + cw / 2, y + rh * 0.68, { align: 'center' });
      });
      const sx = x0 + labelW + A.n * cw;
      doc.setFillColor(234, 240, 254); doc.rect(sx, y, cw, rh, 'FD');
      doc.setFont('helvetica', 'bold'); doc.text(pdfText(fmt(A.points[i])), sx + cw / 2, y + rh * 0.68, { align: 'center' });
      y += rh;
    });
    doc.setDrawColor(200, 206, 214);
    doc.line(x0, 26 + rh, x0 + labelW, 26 + rh);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(93, 104, 119);
    doc.text(pdfText(A.graded
      ? 'Lesart: Zelle = Abstand des Zeilen-Items zum Spalten-Item in Stufen (1 = etwas höher, 2 = höher, 3 = viel höher; Minus = niedriger). Gefragt: gegebene Stufe, errechnet: Differenz der Skalenwerte.'
      : `Lesart: Zelle = ${A.N === 1 ? 'Punkt' : 'Stimmen'} des Zeilen-Items im Vergleich mit dem Spalten-Item. Zeilensumme = Priorität (max. ${maxPts}).`), M, y, { maxWidth: PW - 2 * M });
    y += 5;
    const legend = [[[255, 255, 255], 'gefragt'], [[227, 238, 252], 'errechnet (logisch abgeleitet)']];
    if (c.estimated) legend.push([[253, 241, 216], '~ geschätzt (Schnellmodus)']);
    let lx = M;
    legend.forEach(([col, t]) => {
      doc.setFillColor(...col); doc.rect(lx, y - 3, 4, 4, 'FD');
      doc.text(pdfText(t), lx + 6, y); lx += 8 + doc.getTextWidth(pdfText(t)) + 6;
    });

    // Seite 2: Rangliste
    header('Rangliste');
    const colX = { rank: M, ltr: M + 14, kw: M + 26, pts: M + 132, pct: M + 152, gap: M + 172, bar: M + 186 };
    const barW = PW - M - colX.bar;
    const rh2 = Math.min(8, (PH - 45) / (rows.length + 1));
    y = 28;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(93, 104, 119);
    doc.text('Rang', colX.rank, y); doc.text('Item', colX.ltr, y); doc.text('Stichwort', colX.kw, y);
    doc.text(ptsName, colX.pts + 14, y, { align: 'right' }); doc.text('Anteil', colX.pct + 14, y, { align: 'right' });
    doc.text('Abstand', colX.gap + 12, y, { align: 'right' }); doc.text(pdfText(`${ptsName} (0 – ${fmt(maxPts)})`), colX.bar, y);
    doc.setDrawColor(200, 206, 214); doc.line(M, y + 2, PW - M, y + 2);
    y += 2;
    doc.setTextColor(28, 36, 48);
    rows.forEach((r, k) => {
      const ty = y + rh2 * 0.68;
      if (k % 2) { doc.setFillColor(245, 246, 248); doc.rect(M, y, PW - 2 * M, rh2, 'F'); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(r.rank + '.', colX.rank, ty);
      doc.setFont('helvetica', 'bold'); doc.text(r.letter, colX.ltr, ty);
      doc.setFont('helvetica', 'normal');
      let lab = pdfText(r.label);
      while (doc.getTextWidth(lab) > colX.pts - colX.kw - 6 && lab.length > 3) lab = lab.slice(0, -4) + '...';
      doc.text(lab, colX.kw, ty);
      doc.text(pdfText(fmt(r.points)), colX.pts + 14, ty, { align: 'right' });
      doc.text(pdfText(pct(r.points, maxPts)), colX.pct + 14, ty, { align: 'right' });
      doc.text(r.gap === null ? '-' : pdfText(fmt(r.gap)), colX.gap + 12, ty, { align: 'right' });
      doc.setFillColor(...accent);
      const bw = maxPts ? barW * r.points / maxPts : 0;
      if (bw > 0) doc.rect(colX.bar, y + rh2 * 0.2, bw, rh2 * 0.6, 'F');
      y += rh2;
    });
    doc.setFontSize(8.5); doc.setTextColor(93, 104, 119);
    doc.text(pdfText(A.graded ? 'Abstand = Differenz der Skalenwerte zum nächsthöheren Rang (in Stufen: 1 = etwas höher, 2 = höher, 3 = viel höher).' : 'Abstand = Punktdifferenz zum nächsthöheren Rang. Gleiche Punktzahl = gleicher Rang.'), M, y + 6);

    // Seite 3: Prioritätenskala
    header('Grafische Darstellung: Prioritätenskala');
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    const sx0 = M + 8, sw = PW - 2 * M - 16;
    const { list, levels } = layoutLabels(rows, axisMax, sx0, sw, s => doc.getTextWidth(pdfText(s)), 3);
    const lh = Math.min(8, (PH - 75) / Math.max(1, levels));
    const axisY = 34 + levels * lh + 6;
    doc.setDrawColor(190, 197, 206); doc.setTextColor(28, 36, 48);
    const lty = it => 34 + (levels - 1 - it.level) * lh;
    doc.setLineWidth(0.2);
    list.forEach(it => doc.line(it.x, lty(it) + 1.2, it.x, axisY));
    list.forEach(it => {
      doc.setFillColor(255, 255, 255);
      doc.rect(it.left - 0.8, lty(it) - 3.2, it.w + 1.6, 4.4, 'F');
      doc.text(pdfText(scaleLabel(it.r)), it.left, lty(it));
    });
    doc.setDrawColor(93, 104, 119); doc.setLineWidth(0.5);
    doc.line(sx0, axisY, sx0 + sw, axisY);
    doc.setLineWidth(0.3); doc.setFontSize(8); doc.setTextColor(93, 104, 119);
    ticks(axisMax).forEach(t => {
      const x = sx0 + t / axisMax * sw;
      doc.line(x, axisY, x, axisY + 1.8);
      doc.text(String(t), x, axisY + 5.5, { align: 'center' });
    });
    const uniq = [...new Set(rows.map(r => r.points))].sort((a, b) => a - b);
    doc.setFontSize(7.5);
    for (let k = 1; k < uniq.length; k++) {
      const xa = sx0 + uniq[k - 1] / axisMax * sw, xb = sx0 + uniq[k] / axisMax * sw;
      if (xb - xa >= 6) {
        doc.setDrawColor(190, 197, 206); doc.line(xa + 0.8, axisY + 9, xb - 0.8, axisY + 9);
        doc.text('+' + pdfText(fmt(uniq[k] - uniq[k - 1])), (xa + xb) / 2, axisY + 12.5, { align: 'center' });
      }
    }
    doc.setFillColor(...accent);
    list.forEach(it => doc.circle(it.x, axisY, 1.4, 'F'));
    doc.setFontSize(8.5);
    doc.text(pdfText(`Position auf der Achse = ${A.graded ? 'Skalenwert' : 'Punktzahl'}. Je größer der Abstand zwischen zwei Punkten, desto deutlicher der Prioritätsunterschied. Die Zahlen unter der Achse zeigen die Abstände zwischen benachbarten Rängen.`), M, Math.min(PH - 14, axisY + 20), { maxWidth: PW - 2 * M });

    const fname = (S.title.trim() || 'priorisierung').toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '') || 'priorisierung';
    doc.save(`${fname}-paarvergleich.pdf`);
  }

  // ---------- Sitzung ----------
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'paarvergleich-sitzung.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('importFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { S = sanitize(JSON.parse(t)); save(); $('itemRows').innerHTML = ''; render(); })
      .catch(() => alert('Die Datei konnte nicht gelesen werden.'));
    e.target.value = '';
  });
  $('resetBtn').addEventListener('click', () => {
    if (!confirm('Alle Eingaben löschen und neu beginnen?')) return;
    S = fresh(); save(); $('itemRows').innerHTML = ''; render();
  });

  render();
})();
