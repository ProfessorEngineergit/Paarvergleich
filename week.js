/*
 * Wochenplanung: berufliche und private Projekte einer Woche erfassen, in zwei Durchläufen
 * (Wichtigkeit, Dringlichkeit) abgestuft paarweise vergleichen, am Median in vier Bereiche
 * einteilen und während der Woche nachhalten.
 *
 * Die Daten liegen getrennt vom Paarvergleich unter eigenem Schlüssel im Browser, damit
 * nicht erledigte Projekte und die Tracking-Liste von Woche zu Woche erhalten bleiben.
 */
(function () {
  'use strict';

  const KEY = 'wochenplanung-v1';
  const MAXP = 20;
  const ABC = 'abcdefghijklmnopqrstuvwxyz';
  const $ = id => document.getElementById(id);
  const App = () => window.PVApp;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = v => String(Math.round(v * 10) / 10).replace('.', ',');
  const fmtH = v => v == null || !isFinite(v) ? '–' : fmt(v) + ' h';
  const shorten = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  // Farben: Magenta, Blau, Grau, Grün
  const QUADS = {
    1: { rgb: [233, 70, 115], name: 'Relativ wichtige und dringliche Projekte', short: 'Fokus',
      field: 'Das Feld des Fokus', q: 'Wie mache ich das am effektivsten?',
      text: 'Was kann ich vielleicht mit erledigen, wen kann ich mit einbeziehen, um die positive Wirkung zu verstärken?' },
    2: { rgb: [90, 128, 239], name: 'Dringliche, relativ weniger wichtige Projekte', short: 'Notwendigkeit',
      field: 'Das Feld der Notwendigkeit', q: 'Wie mache ich das am effizientesten?',
      text: 'Wie kann ich meinen eigenen Aufwand minimieren und dabei das Notwendige erfüllen?' },
    3: { rgb: [140, 148, 158], name: 'Relativ weniger dringliche und weniger wichtige Projekte', short: 'Abwägung',
      field: 'Das Feld der Abwägung', q: 'Worum geht es dabei für mich „eigentlich“?',
      text: 'Was kann ich am ehesten weglassen? Kann ich anders auf das Projekt schauen, um ihm mehr Bedeutung zu geben?' },
    4: { rgb: [76, 177, 97], name: 'Wichtige, relativ weniger dringliche Projekte', short: 'Wert',
      field: 'Das Feld des Wertes', q: 'Zumindest etwas davon in dieser Woche!',
      text: 'Wenn Projekte zu lange in diesem Feld bleiben, tauchen sie irgendwann im roten Bereich auf.' },
  };
  const DIMS = {
    imp: { name: 'Wichtigkeit', run: 1, q: 'Welches Projekt hat die höhere Wichtigkeit – und wie viel wichtiger?',
      hint: 'Relativer Nutzen für meine beruflichen und privaten Werte (Gesundheit, Familie, Freunde, Erfolg, Entwicklung).',
      g: { 3: 'viel wichtiger', 2: 'wichtiger', 1: 'etwas wichtiger' } },
    urg: { name: 'Dringlichkeit', run: 2, q: 'Welches Projekt hat die höhere Dringlichkeit – und wie viel dringender?',
      hint: 'Relativer Schaden, wenn es nicht in dieser Woche geschieht.',
      g: { 3: 'viel dringender', 2: 'dringender', 1: 'etwas dringender' } },
  };
  const STATUS = ['open', 'done', 'more', 'moved', 'dropped'];

  // ---------- Daten ----------
  const blank = () => ({ cur: null, backlog: [], tracking: [] });
  let W = load();
  let editId = null;

  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? sanitize(JSON.parse(raw)) : blank(); } catch (e) { return blank(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(W)); } catch (e) { /* ohne Speicher weiterarbeiten */ } }
  const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  const isIsoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  function cleanProject(p) {
    if (!p || typeof p !== 'object' || !str(p.label, 60).trim()) return null;
    const h = Number(p.hours);
    return {
      id: str(p.id, 40) || newId(), label: str(p.label, 60).trim(), desc: str(p.desc, 200),
      hours: isFinite(h) && h >= 0 ? Math.round(h * 10) / 10 : 0,
      kind: p.kind === 'private' ? 'private' : 'work',
      shifts: Math.max(0, parseInt(p.shifts, 10) || 0),
    };
  }
  function cleanAnswers(a) {
    return Array.isArray(a) ? a.filter(x => x && typeof x.a === 'string' && typeof x.b === 'string' && (x.x === 0 || x.x === 1))
      .map(x => ({ a: x.a, b: x.b, x: x.x, g: [1, 2, 3].includes(x.g) ? x.g : 1 })) : [];
  }
  function sanitize(o) {
    const w = blank();
    if (!o || typeof o !== 'object') return w;
    if (Array.isArray(o.backlog)) w.backlog = o.backlog.map(cleanProject).filter(Boolean);
    if (Array.isArray(o.tracking)) w.tracking = o.tracking.map(t => {
      const p = cleanProject(t);
      return p && isIsoDate(t.week) ? { ...p, result: t.result === 'more' ? 'more' : 'done', week: t.week } : null;
    }).filter(Boolean);
    const c = o.cur;
    if (c && typeof c === 'object') {
      w.cur = {
        start: isIsoDate(c.start) ? c.start : defaultStart(),
        hours: isFinite(Number(c.hours)) && c.hours !== null && c.hours !== '' ? Math.max(0, Math.round(Number(c.hours) * 10) / 10) : null,
        projects: (Array.isArray(c.projects) ? c.projects : []).map(p => {
          const q = cleanProject(p);
          return q && { ...q, carried: !!p.carried, keep: !!p.keep, status: STATUS.includes(p.status) ? p.status : 'open' };
        }).filter(Boolean),
        imp: cleanAnswers(c.imp), urg: cleanAnswers(c.urg),
        log: Array.isArray(c.log) ? c.log.filter(d => d === 'imp' || d === 'urg') : [],
      };
    }
    return w;
  }
  function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- Datum ----------
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
  // Freitag bis Sonntag wird in der Regel schon die kommende Woche geplant.
  function defaultStart() { const t = new Date(), m = mondayOf(t); if ((t.getDay() + 6) % 7 >= 4) m.setDate(m.getDate() + 7); return iso(m); }
  function isoWeek(d) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
    return Math.ceil(((x - Date.UTC(x.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }
  const dm = d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  function weekLabel(s) {
    const d = parseIso(mondayIso(s)), e = new Date(d); e.setDate(e.getDate() + 6);
    return `KW ${isoWeek(d)} · ${dm(d)}–${dm(e)}${e.getFullYear()}`;
  }
  const mondayIso = s => iso(mondayOf(parseIso(s)));

  function parseHours(v) {
    const t = String(v == null ? '' : v).trim().replace(',', '.');
    if (!t) return null;
    if (!/^\d*\.?\d*$/.test(t)) return NaN;
    const h = parseFloat(t);
    return isFinite(h) && h >= 0 && h <= 168 ? Math.round(h * 10) / 10 : NaN;
  }

  // ---------- Woche ----------
  function cur() {
    if (!W.cur) {
      // Nicht erledigte Projekte der Vorwoche werden übernommen.
      W.cur = { start: defaultStart(), hours: null, imp: [], urg: [], log: [],
        projects: W.backlog.map(b => ({ ...b, carried: true, keep: false, status: 'open' })) };
      W.backlog = [];
      save();
    }
    return W.cur;
  }
  const active = () => cur().projects.filter(p => p.status === 'open');
  const included = () => cur().projects.filter(p => p.status === 'open' || p.keep);
  const sumHours = list => Math.round(list.reduce((s, p) => s + (p.hours || 0), 0) * 10) / 10;

  function analyses() {
    const c = cur(), inc = included();
    const letter = {};
    inc.forEach((p, k) => { letter[p.id] = k < ABC.length ? ABC[k] : String(k + 1); });
    const items = inc.map(p => ({ letter: letter[p.id], label: p.label }));
    if (inc.length < 2) return { inc, letter, imp: null, urg: null, complete: false };
    const conv = list => list.map(a => ({ a: letter[a.a], b: letter[a.b], x: a.x, g: a.g })).filter(a => a.a && a.b);
    const imp = PV.analyze(items, conv(c.imp), 1, false, true);
    const urg = PV.analyze(items, conv(c.urg), 1, false, true);
    return { inc, letter, imp, urg, complete: imp.complete && urg.complete };
  }

  // Aufteilung am Median. Bei ungerader Anzahl kommt das mittlere Projekt in die Hälfte,
  // deren Nachbar ihm auf der Skala näher liegt (bei Gleichstand nach oben).
  function splitHalf(v) {
    const n = v.length, ord = [...v.keys()].sort((a, b) => v[b] - v[a] || a - b);
    const sorted = ord.map(i => v[i]);
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    let k = n >> 1;
    if (n % 2) { const up = sorted[k - 1] - sorted[k], dn = sorted[k] - sorted[k + 1]; if (up <= dn) k++; }
    const high = new Array(n).fill(false);
    ord.slice(0, k).forEach(i => { high[i] = true; });
    const t = (sorted[k - 1] + sorted[k]) / 2, max = sorted[0], min = sorted[n - 1];
    // Position 0…1 auf der Achse; die Grenze zwischen den Hälften liegt immer bei 0,5.
    const pos = x => x >= t ? 0.5 + 0.5 * (max > t ? (x - t) / (max - t) : 0) : 0.5 * (t > min ? (x - min) / (t - min) : 0);
    return { high, median, pos: v.map(pos) };
  }

  function classify(R) {
    const si = splitHalf(R.imp.points), su = splitHalf(R.urg.points);
    const rows = R.inc.map((p, k) => {
      const hi = si.high[k], hu = su.high[k];
      return { p, k, letter: R.letter[p.id], imp: R.imp.points[k], urg: R.urg.points[k],
        pi: si.pos[k], pu: su.pos[k], q: hi && hu ? 1 : hu ? 2 : hi ? 4 : 3 };
    });
    const sortKey = { 1: r => r.pi + r.pu, 2: r => r.pu * 2 + r.pi, 3: r => r.pi + r.pu, 4: r => r.pi * 2 + r.pu };
    const groups = {};
    [1, 2, 3, 4].forEach(q => { groups[q] = rows.filter(r => r.q === q).sort((a, b) => sortKey[q](b) - sortKey[q](a)); });
    return { rows, groups, medImp: si.median, medUrg: su.median };
  }

  // ---------- Bausteine ----------
  function totalHtml(planned, extra) {
    const c = cur(), avail = c.hours;
    const sum = Math.round((planned + (extra || 0)) * 10) / 10;
    if (!avail) return `<div class="tot none"><b>${fmtH(sum)}</b> geplant · Bitte die verfügbare Gesamtzeit eingeben.</div>`;
    const r = sum / avail, cls = r >= 1 ? 'red' : r >= 0.8 ? 'yellow' : 'green';
    return `<div class="tot ${cls}"><b>${fmtH(sum)}</b> von ${fmtH(avail)} geplant (${Math.round(100 * r)} %)` +
      (extra ? ' <small>inkl. aktueller Eingabe</small>' : '') +
      (cls === 'red' ? ' · Bitte Projekte anpassen, verschieben oder streichen.' : '') + '</div>';
  }
  const totalClass = sum => { const a = cur().hours; if (!a) return ''; const r = sum / a; return r >= 1 ? 'red' : r >= 0.8 ? 'yellow' : 'green'; };

  const ACTS = {
    edit: 'ändern', move: 'verschieben', drop: 'streichen', restore: 'zurückholen',
    done: 'erledigt wie geplant', more: 'erledigt mit mehr Zeit', reopen: 'zurücknehmen',
  };
  function rowHtml(p, acts, o) {
    o = o || {};
    const priv = p.kind === 'private';
    if (editId === p.id) {
      return `<div class="prow editing" data-id="${p.id}">
        <div class="pedit">
          <input type="text" class="eLabel" maxlength="60" value="${esc(p.label)}" aria-label="Stichwort">
          <input type="text" class="eHours" inputmode="decimal" value="${fmt(p.hours)}" aria-label="Dauer in Stunden">
          <input type="text" class="eDesc" maxlength="200" value="${esc(p.desc)}" placeholder="Kurze Beschreibung" aria-label="Kurze Beschreibung">
          <span class="kind"><label><input type="radio" name="eKind" value="work" ${priv ? '' : 'checked'}> beruflich</label><label><input type="radio" name="eKind" value="private" ${priv ? 'checked' : ''}> <i>privat</i></label></span>
        </div>
        <div class="pacts"><button class="mini primary" data-act="save">Speichern</button><button class="mini" data-act="cancel">Abbrechen</button></div>
        <p class="err left eErr"></p>
      </div>`;
    }
    return `<div class="prow${priv ? ' priv' : ''}${o.q ? ' q' + o.q : ''}${o.muted ? ' muted-row' : ''}" data-id="${p.id}">
      <div class="pmain">
        ${o.letter ? `<span class="pltr">${o.letter}</span>` : ''}<span class="pl">${esc(p.label)}</span>
        <span class="ptag">${priv ? 'privat' : 'beruflich'}</span>
        ${p.shifts ? `<span class="pshift" title="Anzahl der bisherigen Verschiebungen">${p.shifts}× verschoben</span>` : ''}
        ${o.note ? `<span class="ptag">${o.note}</span>` : ''}
        ${p.desc ? `<div class="pdesc">${esc(p.desc)}</div>` : ''}
      </div>
      <div class="phours">${fmtH(p.hours)}</div>
      <div class="pacts">${acts.map(a => `<button class="mini${a === 'done' ? ' ok' : a === 'more' ? ' more' : ''}" data-act="${a}">${ACTS[a]}</button>`).join('')}</div>
    </div>`;
  }

  function groupsHtml(cls, acts) {
    const open = cls.rows.filter(r => r.p.status === 'open');
    return [1, 2, 3, 4].map(q => {
      const Q = QUADS[q], list = cls.groups[q].filter(r => r.p.status === 'open');
      return `<div class="qgroup q${q}">
        <div class="qhead"><span class="qnum">${q}</span><span class="qname">${Q.name}</span>
          <span class="qsum">${list.length} · ${fmtH(sumHours(list.map(r => r.p)))}</span>
          <button class="ibtn" data-info="${q}" aria-expanded="false" title="Hinweise zum weiteren Vorgehen">i</button></div>
        <div class="qinfo" hidden><b>${Q.q}</b> <span class="muted">(${Q.field})</span><br>${Q.text}</div>
        ${list.length ? list.map(r => rowHtml(r.p, acts, { q, letter: r.letter })).join('') : '<p class="muted small empty">Keine Projekte in diesem Bereich.</p>'}
      </div>`;
    }).join('') + (open.length ? '' : '<p class="muted">Alle Projekte dieser Woche sind bearbeitet.</p>');
  }

  function parkedHtml(title, list, acts) {
    if (!list.length) return '';
    return `<div class="parked"><h4>${title}</h4>${list.map(p => rowHtml(p, acts, { muted: true,
      note: p.status === 'moved' ? 'auf nächste Woche verschoben' : p.status === 'dropped' ? 'gestrichen' : p.status === 'more' ? 'erledigt mit mehr Zeit' : 'erledigt wie geplant' })).join('')}</div>`;
  }

  function trackingHtml() {
    const ref = [iso(mondayOf(new Date())), W.cur ? mondayIso(W.cur.start) : ''].sort().pop();
    const cut = parseIso(ref); cut.setDate(cut.getDate() - 21);
    const list = W.tracking.filter(t => mondayIso(t.week) >= iso(cut));
    if (!list.length) return '<p class="muted small">Noch keine erledigten Projekte in den letzten vier Wochen.</p>';
    const weeks = [...new Set(list.map(t => mondayIso(t.week)))].sort().reverse();
    return weeks.map(wk => {
      const rows = list.filter(t => mondayIso(t.week) === wk);
      return `<div class="twk"><h4>${weekLabel(wk)} <span class="muted small">· ${rows.length} erledigt · ${fmtH(sumHours(rows))}</span></h4>
        <div class="scroll"><table class="rank track"><thead><tr><th>Projekt</th><th class="num">Dauer</th><th class="num">Verschiebungen</th><th>Ergebnis</th></tr></thead><tbody>` +
        rows.map(t => `<tr class="${t.result === 'more' ? 'tmore' : ''}${t.kind === 'private' ? ' priv' : ''}"><td class="kw"><span class="pl">${esc(t.label)}</span>${t.desc ? `<div class="pdesc">${esc(t.desc)}</div>` : ''}</td><td class="num">${fmtH(t.hours)}</td><td class="num">${t.shifts}</td><td>${t.result === 'more' ? 'mit mehr Zeit' : 'wie geplant'}</td></tr>`).join('') +
        '</tbody></table></div></div>';
    }).join('') + '<p class="muted small"><span class="swatch tmore-sw"></span>mit mehr Zeit erledigt</p>';
  }

  // ---------- Schritt W2: Projekte erfassen ----------
  function renderPlan() {
    const c = cur();
    $('wStart').value = c.start;
    if (document.activeElement !== $('wHours')) $('wHours').value = c.hours == null ? '' : fmt(c.hours);
    const carried = c.projects.filter(p => p.carried && p.status === 'open');
    const fresh = c.projects.filter(p => !p.carried && p.status === 'open');
    const planActs = ['edit', 'move', 'drop'];
    $('wCarried').innerHTML = carried.length ? carried.map(p => rowHtml(p, planActs)).join('')
      : '<p class="muted small">Keine offenen Projekte aus der letzten Woche.</p>';
    $('wList').innerHTML = fresh.length ? fresh.map(p => rowHtml(p, planActs)).join('') : '';
    $('wParked').innerHTML = parkedHtml('Verschoben oder gestrichen', c.projects.filter(p => p.status === 'moved' || p.status === 'dropped'), ['restore']);
    $('wTrack2').innerHTML = trackingHtml();
    planInfo();
  }
  function planInfo() {
    const n = active().length;
    const pending = parseHours($('aHours').value);
    const extra = $('aLabel').value.trim() && isFinite(pending) && pending ? pending : 0;
    $('wTotal').innerHTML = totalHtml(sumHours(active()), extra);
    const pairs = n * (n - 1) / 2;
    $('wInfo').textContent = n < 2 ? 'Mindestens zwei Projekte erfassen.'
      : n > MAXP ? `${n} Projekte – bitte auf höchstens ${MAXP} reduzieren (verschieben oder streichen).`
      : `${n} von maximal ${MAXP} Projekten · je Durchlauf ${pairs} mögliche Paare, durch Ableitung werden meist deutlich weniger abgefragt.`;
    $('wToCompare').disabled = n < 2 || n > MAXP;
    $('aAdd').disabled = n >= MAXP;
  }
  function addProject() {
    const label = $('aLabel').value.trim(), h = parseHours($('aHours').value);
    let err = '';
    if (!label) err = 'Bitte ein Stichwort eingeben.';
    else if (h == null || !isFinite(h) || h <= 0) err = 'Bitte die Dauer in Stunden angeben (z. B. 1,5).';
    else if (active().length >= MAXP) err = `Höchstens ${MAXP} Projekte.`;
    $('aErr').textContent = err;
    if (err) return;
    const kind = document.querySelector('input[name=aKind]:checked').value;
    cur().projects.push({ id: newId(), label, hours: h, desc: $('aDesc').value.trim(), kind, shifts: 0, carried: false, keep: false, status: 'open' });
    save();
    $('aLabel').value = ''; $('aHours').value = ''; $('aDesc').value = '';
    renderPlan();
    $('aLabel').focus();
  }
  $('aAdd').addEventListener('click', addProject);
  ['aLabel', 'aHours', 'aDesc'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') addProject(); }));
  ['aLabel', 'aHours'].forEach(id => $(id).addEventListener('input', () => { $('aErr').textContent = ''; planInfo(); }));
  $('wHours').addEventListener('input', e => {
    const h = parseHours(e.target.value);
    if (h === null || isFinite(h)) { cur().hours = h; save(); planInfo(); }
  });
  $('wHours').addEventListener('blur', () => renderPlan());
  $('wStart').addEventListener('change', e => { if (isIsoDate(e.target.value)) { cur().start = e.target.value; save(); } });
  $('wBack1').addEventListener('click', () => App().go(1));
  $('wToCompare').addEventListener('click', () => {
    if (!cur().hours && !confirm('Es ist noch keine verfügbare Gesamtzeit eingetragen. Trotzdem fortfahren?')) return;
    App().go(analyses().complete ? 4 : 3);
  });

  // ---------- Schritt W3: Vergleiche ----------
  function renderCompare() {
    const c = cur(), R = analyses();
    if (R.inc.length < 2) { App().go(2); return; }
    if (R.complete) { App().go(4); return; }
    const dim = R.imp.complete ? 'urg' : 'imp', D = DIMS[dim], A = R[dim];
    const ci = R.imp.counts, cu = R.urg.counts;
    const settled = ci.asked + ci.inferred + cu.asked + cu.inferred;
    $('wProgBar').style.width = (100 * settled / (2 * ci.pairs)) + '%';
    $('wProgText').textContent = `Durchlauf ${D.run} von 2: ${D.name} · ${A.counts.asked + A.counts.inferred} von ${A.counts.pairs} Paaren bestimmt (${A.counts.asked} gefragt, ${A.counts.inferred} errechnet)`;
    $('wUndo').disabled = !(c.imp.length || c.urg.length);
    const q = A.next, pa = R.inc[q.i], pb = R.inc[q.j], la = R.letter[pa.id], lb = R.letter[pb.id];
    const card = (p, l) => `<div class="gitem${p.kind === 'private' ? ' priv' : ''}"><span class="ltr">${l}</span><span class="pl">${esc(p.label)}</span>
      <small class="muted">${fmtH(p.hours)} · ${p.kind === 'private' ? 'privat' : 'beruflich'}</small>${p.desc ? `<small class="pdesc">${esc(p.desc)}</small>` : ''}</div>`;
    const side = (p, l, order, off) => `<div class="gcol">${card(p, l)}<div class="gbtns">` +
      order.map((g, k) => `<button class="gpick s${g}" data-side="${p === pa ? 1 : 0}" data-g="${g}"><span>${D.g[g]}</span><kbd>${off + k + 1}</kbd></button>`).join('') + '</div></div>';
    const fresh = dim === 'urg' && !cu.asked;
    $('wQuestion').innerHTML = `
      <p class="runbadge run-${dim}">${D.run}. Durchlauf: ${D.name}</p>
      ${fresh ? '<p class="hint ok-note">Wichtigkeit abgeschlossen. Jetzt dieselben Projekte nach Dringlichkeit vergleichen.</p>' : ''}
      <p class="q-title">${D.q}</p>
      <p class="hint">${D.hint}</p>
      <div class="gduel">${side(pa, la, [3, 2, 1], 0)}${side(pb, lb, [1, 2, 3], 3)}</div>
      <p class="hint">Ein Klick genügt (Tasten 1–6, Rücktaste = zurücknehmen).</p>`;
    $('wQuestion').querySelectorAll('.gpick').forEach(btn => btn.addEventListener('click', () => {
      c[dim].push({ a: pa.id, b: pb.id, x: +btn.dataset.side, g: +btn.dataset.g });
      c.log.push(dim);
      save(); App().go(3);
    }));
  }
  function undo() {
    const c = cur();
    let dim = c.log.pop();
    if (!dim || !c[dim].length) dim = c.urg.length ? 'urg' : c.imp.length ? 'imp' : null;
    if (!dim) return;
    c[dim].pop(); save(); App().go(3);
  }
  $('wUndo').addEventListener('click', undo);
  $('wBack2').addEventListener('click', () => App().go(2));
  document.addEventListener('keydown', e => {
    if (App().mode() !== 'week' || App().step() !== 3 || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const gb = document.querySelectorAll('#wQuestion .gpick');
    if (gb.length === 6 && /^[1-6]$/.test(e.key)) gb[+e.key - 1].click();
    if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); undo(); }
  });

  // ---------- Schritt W4: Ergebnis ----------
  function renderResult() {
    const c = cur(), R = analyses();
    if (R.inc.length < 2) { App().go(2); return; }
    if (!R.complete) { App().go(3); return; }
    const cls = classify(R), open = active(), planned = sumHours(open);
    $('wResSub').textContent = weekLabel(c.start);
    const kpi = (v, t, k) => `<div class="kpi${k ? ' ' + k : ''}"><b>${v}</b>${t}</div>`;
    const asked = R.imp.counts.asked + R.urg.counts.asked, pairs = R.imp.counts.pairs;
    $('wKpis').innerHTML = kpi(fmtH(c.hours), 'verfügbar') + kpi(fmtH(planned), 'geplant', 'tot-' + totalClass(planned)) +
      kpi(open.length, `Projekte (${open.filter(p => p.kind === 'private').length} privat)`) +
      kpi(fmt(cls.medImp), 'Median Wichtigkeit') + kpi(fmt(cls.medUrg), 'Median Dringlichkeit') +
      `<div class="status ok">Beide Durchläufe vollständig: je ${pairs} Paare bewertet, ${asked} von ${2 * pairs} Vergleichen gefragt, der Rest errechnet.</div>`;
    $('wGroups').innerHTML = groupsHtml(cls, ['edit', 'move', 'drop']);
    $('wParked4').innerHTML = parkedHtml('Verschoben oder gestrichen', c.projects.filter(p => p.status === 'moved' || p.status === 'dropped'), ['restore']);
    drawMatrix($('wMatrix'), cls);
    detail($('wDetImp'), R.imp);
    detail($('wDetUrg'), R.urg);
  }
  function detail(el, A) {
    const a = App(), rows = PV.ranking(A);
    el.innerHTML = `<h4>Rangliste</h4><div class="scroll"><table class="rank">${a.rankHtml(A, rows)}</table></div>
      <h4>Prioritätenskala</h4><p class="muted small">${a.scaleNote(A)}</p><div class="scroll scalebox">${a.scaleSvg(rows, Math.max(1, Math.ceil(A.maxPts)))}</div>
      <h4>Bewertungsmatrix</h4><p class="muted small">${a.legendHtml(A)}</p><div class="scroll"><table class="matrix">${a.matrixHtml(A)}</table></div>`;
  }
  $('wEdit').addEventListener('click', () => App().go(2));
  $('wBack3').addEventListener('click', () => { if (confirm('Letzte Antwort zurücknehmen, um sie zu korrigieren?')) undo(); });
  $('wToStatus').addEventListener('click', () => App().go(5));

  // ---------- Vier-Felder-Matrix ----------
  // Beschriftungen auseinanderschieben, ohne ihr Feld zu verlassen.
  function relax(boxes, gap) {
    const clamp = b => {
      b.x = Math.min(Math.max(b.x, b.bx0), b.bx1 - b.w);
      b.y = Math.min(Math.max(b.y, b.by0), b.by1 - b.h);
    };
    boxes.forEach(clamp);
    for (let it = 0; it < 300; it++) {
      let moved = false;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + gap;
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + gap;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (oy <= ox * 1.5) {
          const d = (a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1) * oy / 2;
          a.y += d; b.y -= d;
        } else {
          const d = (a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1) * ox / 2;
          a.x += d; b.x -= d;
        }
        clamp(a); clamp(b);
      }
      if (!moved) break;
    }
    return boxes;
  }
  // Feldgrenzen: x = Dringlichkeit (rechts hoch), y = Wichtigkeit (oben hoch).
  function bounds(r, W0, H0, pad) {
    const right = r.pu >= 0.5, top = r.pi >= 0.5;
    return { bx0: right ? W0 / 2 + pad : pad, bx1: right ? W0 - pad : W0 / 2 - pad, by0: top ? pad : H0 / 2 + pad, by1: top ? H0 / 2 - pad : H0 - pad };
  }
  const axisPos = p => 0.5 + (p - 0.5) * 0.86;

  function drawMatrix(el, cls) {
    const list = cls.rows.filter(r => r.p.status === 'open');
    el.innerHTML = `<div class="qm-wrap"><div class="qm-y">Wichtigkeit →</div><div class="qm-area">
        <div class="qq q4"><span>4 · Wert</span></div><div class="qq q1"><span>1 · Fokus</span></div>
        <div class="qq q3"><span>3 · Abwägung</span></div><div class="qq q2"><span>2 · Notwendigkeit</span></div>
        ${list.map(r => `<button class="chip q${r.q}${r.p.kind === 'private' ? ' priv' : ''}" data-id="${r.p.id}" aria-label="${esc(r.p.label)}">${esc(shorten(r.p.label, 18))}</button>`).join('')}
        <div class="qtip" hidden></div></div></div><div class="qm-x">Dringlichkeit →</div>`;
    const area = el.querySelector('.qm-area');
    const layout = () => {
      const W0 = area.clientWidth, H0 = area.clientHeight;
      if (!W0) return;
      const boxes = list.map(r => {
        const ch = area.querySelector(`.chip[data-id="${r.p.id}"]`);
        const w = ch.offsetWidth, h = ch.offsetHeight;
        return { ch, w, h, x: axisPos(r.pu) * W0 - w / 2, y: (1 - axisPos(r.pi)) * H0 - h / 2, ...bounds(r, W0, H0, 4) };
      });
      relax(boxes, 3).forEach(b => { b.ch.style.left = b.x + 'px'; b.ch.style.top = b.y + 'px'; });
    };
    layout();
    el._layout = layout;
    const tip = area.querySelector('.qtip');
    let pinned = null;
    const show = ch => {
      const p = cur().projects.find(x => x.id === ch.dataset.id);
      if (!p) return;
      tip.innerHTML = `<b class="${p.kind === 'private' ? 'pl-i' : ''}">${esc(p.label)}</b> <span class="muted">· ${fmtH(p.hours)} · ${p.kind === 'private' ? 'privat' : 'beruflich'}</span>` +
        (p.desc ? `<div>${esc(p.desc)}</div>` : '<div class="muted">Keine Beschreibung.</div>');
      tip.hidden = false;
      const aw = area.clientWidth, tw = Math.min(260, aw - 8);
      tip.style.width = tw + 'px';
      let x = ch.offsetLeft + ch.offsetWidth / 2 - tw / 2;
      x = Math.max(4, Math.min(x, aw - tw - 4));
      let y = ch.offsetTop + ch.offsetHeight + 6;
      if (y + tip.offsetHeight > area.clientHeight - 4) y = ch.offsetTop - tip.offsetHeight - 6;
      tip.style.left = x + 'px'; tip.style.top = Math.max(4, y) + 'px';
    };
    area.querySelectorAll('.chip').forEach(ch => {
      ch.addEventListener('mouseenter', () => { if (!pinned) show(ch); });
      ch.addEventListener('mouseleave', () => { if (!pinned) tip.hidden = true; });
      ch.addEventListener('click', e => {
        e.stopPropagation();
        if (pinned === ch) { pinned = null; tip.hidden = true; return; }
        pinned = ch; show(ch);
      });
    });
    area.addEventListener('click', () => { pinned = null; tip.hidden = true; });
  }
  let resizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { const el = $('wMatrix'); if (el && el._layout && !el.closest('.step').hidden) el._layout(); }, 120);
  });

  // ---------- Schritt W5: Projektstand ----------
  function renderStatus() {
    const c = cur(), R = analyses();
    if (R.inc.length < 2) { App().go(2); return; }
    if (!R.complete) { App().go(3); return; }
    const cls = classify(R), open = active(), openH = sumHours(open);
    const done = c.projects.filter(p => p.status === 'done' || p.status === 'more');
    $('wStSub').textContent = weekLabel(c.start);
    const kpi = (v, t, k) => `<div class="kpi${k ? ' ' + k : ''}"><b>${v}</b>${t}</div>`;
    $('wStKpis').innerHTML = kpi(open.length, 'offen') + kpi(fmtH(openH), 'offene Dauer', 'tot-' + totalClass(openH)) +
      kpi(done.length, 'erledigt') + kpi(c.projects.filter(p => p.status === 'moved').length, 'verschoben') + kpi(fmtH(c.hours), 'verfügbar');
    $('wStGroups').innerHTML = groupsHtml(cls, ['done', 'more', 'move', 'drop']);
    $('wStDone').innerHTML = parkedHtml('In dieser Woche bereits bearbeitet', c.projects.filter(p => p.status !== 'open'), ['reopen']);
    $('wTrack').innerHTML = trackingHtml();
  }
  $('wToResult').addEventListener('click', () => App().go(4));
  $('wAddMore').addEventListener('click', () => App().go(2));
  $('wNewWeek').addEventListener('click', () => {
    const c = cur();
    const carry = c.projects.filter(p => p.status === 'open' || p.status === 'moved');
    if (!confirm(`Woche abschließen und neue Woche planen?\n\n${carry.length} offene bzw. verschobene Projekte werden in die nächste Wochenplanung übernommen.`)) return;
    closeWeek();
    App().go(2);
  });
  function closeWeek() {
    const c = W.cur;
    if (!c) return;
    c.projects.filter(p => p.status === 'open' || p.status === 'moved').forEach(p => {
      W.backlog.push({ id: p.id, label: p.label, hours: p.hours, desc: p.desc, kind: p.kind, shifts: p.shifts + 1 });
    });
    // Tracking: ältere Einträge als zwölf Wochen werden nicht mehr benötigt.
    const cut = mondayOf(new Date()); cut.setDate(cut.getDate() - 84);
    W.tracking = W.tracking.filter(t => t.week >= iso(cut));
    W.cur = null;
    editId = null;
    save();
  }

  // ---------- Aktionen an Projektzeilen ----------
  document.addEventListener('click', e => {
    const info = e.target.closest('.ibtn');
    if (info) {
      const box = info.closest('.qgroup').querySelector('.qinfo');
      box.hidden = !box.hidden;
      info.setAttribute('aria-expanded', String(!box.hidden));
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn || App().mode() !== 'week') return;
    const row = btn.closest('.prow'), c = cur();
    const p = row && c.projects.find(x => x.id === row.dataset.id);
    if (!p) return;
    const act = btn.dataset.act;
    const complete = () => { const R = analyses(); return R.complete && R.inc.length >= 2; };
    if (act === 'edit') { editId = p.id; }
    else if (act === 'cancel') { editId = null; }
    else if (act === 'save') {
      const label = row.querySelector('.eLabel').value.trim(), h = parseHours(row.querySelector('.eHours').value);
      const err = !label ? 'Bitte ein Stichwort eingeben.' : (h == null || !isFinite(h) || h <= 0) ? 'Bitte die Dauer in Stunden angeben (z. B. 1,5).' : '';
      if (err) { row.querySelector('.eErr').textContent = err; return; }
      Object.assign(p, { label, hours: h, desc: row.querySelector('.eDesc').value.trim(), kind: row.querySelector('input[name=eKind]:checked').value });
      editId = null;
    }
    else if (act === 'move' || act === 'drop') {
      // Nach abgeschlossenen Vergleichen bleibt das Projekt in der Auswertung, damit die übrigen
      // Positionen stabil bleiben und keine neuen Fragen nötig werden.
      if (complete() && (p.status === 'open' || p.keep)) p.keep = true;
      p.status = act === 'move' ? 'moved' : 'dropped';
      if (editId === p.id) editId = null;
    }
    else if (act === 'restore') {
      if (active().length >= MAXP) { alert(`Höchstens ${MAXP} Projekte.`); return; }
      p.status = 'open';
    }
    else if (act === 'done' || act === 'more') {
      if (complete()) p.keep = true;
      p.status = act;
      W.tracking = W.tracking.filter(t => !(t.id === p.id && t.week === c.start));
      W.tracking.push({ id: p.id, label: p.label, hours: p.hours, desc: p.desc, kind: p.kind, shifts: p.shifts, result: act, week: c.start });
    }
    else if (act === 'reopen') {
      W.tracking = W.tracking.filter(t => !(t.id === p.id && t.week === c.start));
      p.status = 'open';
    }
    save();
    App().go(App().step());
  });

  // ---------- PDF ----------
  $('wPdf').addEventListener('click', () => {
    if (!window.jspdf) { alert('Die PDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.'); return; }
    makePdf();
  });
  function makePdf() {
    const a = App(), c = cur(), R = analyses(), cls = classify(R);
    const P = a.pdfNew('Aktuelle Wochenplanung (berufliche und private Projekte)');
    const { doc, PW, PH, M } = P, T = a.pdfText;
    const date = new Date().toLocaleDateString('de-DE');
    const open = active(), planned = sumHours(open);
    const info = `${weekLabel(c.start)}  ·  ${open.length} Projekte  ·  ${date}`;
    const foot = `Verfügbar: ${fmtH(c.hours)} · geplant: ${fmtH(planned)}${c.hours ? ` (${Math.round(100 * planned / c.hours)} %)` : ''} · Median Wichtigkeit ${fmt(cls.medImp)} · Median Dringlichkeit ${fmt(cls.medUrg)}`;
    const font = (p, bold) => doc.setFont('helvetica', p.kind === 'private' ? (bold ? 'bolditalic' : 'italic') : (bold ? 'bold' : 'normal'));
    const fit = (s, w) => { s = T(s); while (doc.getTextWidth(s) > w && s.length > 3) s = s.slice(0, -4) + '...'; return s; };

    // Seite 1: sortierte Projektliste
    P.header('Projektliste nach Priorität', info, foot);
    let y = 27;
    const rh = 5.6;
    [1, 2, 3, 4].forEach(q => {
      const Q = QUADS[q], list = cls.groups[q].filter(r => r.p.status === 'open');
      if (y > PH - 24) { P.header('Projektliste nach Priorität (Fortsetzung)', info, foot); y = 27; }
      doc.setFillColor(...Q.rgb); doc.rect(M, y, PW - 2 * M, 6.5, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(T(`${q}  ${Q.name}`), M + 2, y + 4.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.text(T(`${Q.field}: ${Q.q}   ·   ${list.length} Projekte, ${fmtH(sumHours(list.map(r => r.p)))}`), PW - M - 2, y + 4.5, { align: 'right' });
      y += 6.5 + 1;
      doc.setTextColor(28, 36, 48);
      if (!list.length) { doc.setFontSize(9); doc.setTextColor(93, 104, 119); doc.text('Keine Projekte in diesem Bereich.', M + 2, y + 3.8); y += rh; }
      list.forEach(r => {
        if (y > PH - 18) { P.header('Projektliste nach Priorität (Fortsetzung)', info, foot); y = 27; }
        const p = r.p;
        doc.setFillColor(...Q.rgb); doc.rect(M, y, 1.2, rh - 0.8, 'F');
        doc.setFontSize(9.5); doc.setTextColor(28, 36, 48);
        doc.setFont('helvetica', 'bold'); doc.text(r.letter, M + 3, y + 3.8);
        font(p, true); doc.text(fit(p.label, 62), M + 9, y + 3.8);
        font(p); doc.setFontSize(8.5); doc.setTextColor(93, 104, 119);
        doc.text(fit(p.desc || '', 120), M + 74, y + 3.8);
        doc.setFont('helvetica', 'normal');
        doc.text(p.kind === 'private' ? 'privat' : 'beruflich', M + 200, y + 3.8);
        doc.text(p.shifts ? `${p.shifts}x verschoben` : '', M + 220, y + 3.8);
        doc.setTextColor(28, 36, 48); doc.setFontSize(9.5);
        doc.text(T(fmtH(p.hours)), PW - M - 2, y + 3.8, { align: 'right' });
        y += rh;
      });
      y += 2.5;
    });
    doc.setFontSize(8); doc.setTextColor(93, 104, 119); doc.setFont('helvetica', 'italic');
    doc.text('Kursiv = private Projekte.', M, Math.min(y + 2, PH - 11));

    // Seite 2: Vier-Felder-Matrix
    P.header('Vier-Felder-Matrix', info, foot);
    const ax = M + 14, ay = 26, aw = PW - 2 * M - 14, ah = PH - 26 - 20;
    const tint = (rgb, k) => rgb.map(v => Math.round(255 - (255 - v) * k));
    [[4, 0, 0], [1, 1, 0], [3, 0, 1], [2, 1, 1]].forEach(([q, cx, cy]) => {
      doc.setFillColor(...tint(QUADS[q].rgb, 0.14));
      doc.rect(ax + cx * aw / 2, ay + cy * ah / 2, aw / 2, ah / 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...QUADS[q].rgb);
      const lx = cx ? ax + aw - 2 : ax + 2, ly = cy ? ay + ah - 2 : ay + 5;
      doc.text(T(`${q} · ${QUADS[q].short}`), lx, ly, { align: cx ? 'right' : 'left' });
    });
    doc.setDrawColor(150, 156, 165); doc.setLineWidth(0.3);
    doc.line(ax + aw / 2, ay, ax + aw / 2, ay + ah); doc.line(ax, ay + ah / 2, ax + aw, ay + ah / 2);
    doc.rect(ax, ay, aw, ah);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(93, 104, 119);
    doc.text('Dringlichkeit ->', ax + aw, ay + ah + 5, { align: 'right' });
    doc.text('Wichtigkeit ->', ax - 3, ay + ah, { angle: 90 });
    doc.setFontSize(8.5);
    const list = cls.rows.filter(r => r.p.status === 'open');
    const boxes = list.map(r => {
      font(r.p, false);
      const t = fit(shorten(r.p.label, 22), 60), w = doc.getTextWidth(t) + 3, h = 5;
      const b = bounds(r, aw, ah, 1.5);
      return { r, t, w, h, x: axisPos(r.pu) * aw - w / 2, y: (1 - axisPos(r.pi)) * ah - h / 2, ...b };
    });
    relax(boxes, 1);
    boxes.forEach(b => {
      const rgb = QUADS[b.r.q].rgb;
      doc.setFillColor(255, 255, 255); doc.setDrawColor(...rgb); doc.setLineWidth(0.35);
      doc.roundedRect(ax + b.x, ay + b.y, b.w, b.h, 1.2, 1.2, 'FD');
      font(b.r.p, false); doc.setTextColor(28, 36, 48);
      doc.text(b.t, ax + b.x + 1.5, ay + b.y + 3.5);
    });

    // Danach die Details beider Durchläufe
    a.pdfAnalysisPages(P, R.imp, info, 'Wichtigkeit: ');
    a.pdfAnalysisPages(P, R.urg, info, 'Dringlichkeit: ');
    doc.save(`wochenplanung-kw${isoWeek(parseIso(mondayIso(c.start)))}-${c.start.slice(0, 4)}.pdf`);
  }

  // ---------- Schnittstelle ----------
  window.PVWeek = {
    render(step) {
      if (step === 2) renderPlan();
      else if (step === 3) renderCompare();
      else if (step === 4) renderResult();
      else if (step === 5) renderStatus();
    },
    data: () => W,
    setData(o) { W = sanitize(o); editId = null; save(); },
    reset() {
      if (!confirm('Aktuelle Wochenplanung verwerfen?\n\nÜbernommene Projekte der Vorwoche gehen zurück in die Liste der nicht erledigten Projekte; die Tracking-Liste bleibt erhalten.')) return false;
      if (W.cur) {
        W.cur.projects.filter(p => p.carried && p.status !== 'dropped').forEach(p => {
          W.backlog.push({ id: p.id, label: p.label, hours: p.hours, desc: p.desc, kind: p.kind, shifts: p.shifts });
        });
        W.tracking = W.tracking.filter(t => t.week !== W.cur.start);
      }
      W.cur = null; editId = null; save();
      return true;
    },
  };
})();
