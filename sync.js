/*
 * Konto, Synchronisierung und Kurse (Supabase).
 *
 * - Anmeldung ohne Passwort: E-Mail eingeben, 6-stelligen Code aus der Mail eintippen.
 * - Die App bleibt „lokal zuerst“: Alles wird sofort im Browser gespeichert und bei Anmeldung
 *   im Hintergrund ins Konto übertragen (zuletzt bearbeiteter Stand gewinnt).
 * - Kurse: Coaches legen einen Kurs an und geben den Code weiter. Wer mit Freigabe beitritt,
 *   überträgt zusätzlich Kennzahlen (keine Inhalte), die nur die Kursleitung lesen darf.
 *   Die Trennung erzwingt die Datenbank (siehe supabase/schema.sql), nicht nur diese Oberfläche.
 *
 * Der Schlüssel unten ist der öffentliche „Publishable Key“ und darf im Code stehen.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://pgrmocknvafzsqxkaccd.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_NHAr3dNBzN72ugxJHm_oIA_jIEkYJvI';
  const META_KEY = 'prio-sync-v1';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = v => v == null ? '–' : String(Math.round(v * 10) / 10).replace('.', ',');
  const time = d => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const date = s => new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // ---------- App installierbar machen (PWA) ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { /* ohne Offline-Modus weiter */ }));
  }
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (dlg.open) render(); });
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ---------- Zustand ----------
  const sb = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'prio-auth' },
    })
    : null;
  const dlg = $('acct');
  let user = null;
  let view = 'main';        // main | code | merge | dash
  let pendingEmail = '';
  let note = '';            // Hinweis oder Fehler im Dialog
  let noteErr = false;
  let busy = false;
  let status = 'idle';      // idle | saving | saved | offline | error
  let lastSaved = null;
  let applying = false;
  let pushT = null;
  let mergeRemote = null;
  let courses = { own: [], member: [], counts: {} };
  let dash = null;          // { course, rows, q }

  const meta = (() => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } })();
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ohne Speicher */ } };

  const snapshot = () => ({ v: 1, app: window.PVApp.getState(), week: window.PVWeek.data() });
  const localEmpty = () => window.PVApp.isEmpty() && window.PVWeek.isEmpty();
  function apply(data) {
    applying = true;
    try {
      if (data && data.week) window.PVWeek.setData(data.week, true);
      if (data && data.app) window.PVApp.setState(data.app);
    } finally { applying = false; }
  }

  // ---------- Synchronisierung ----------
  function touch() {
    if (applying || !user || !sb) return;
    meta.dirty = true; saveMeta();
    setStatus('saving');
    clearTimeout(pushT);
    pushT = setTimeout(push, 1200);
  }
  async function push() {
    // Solange offen ist, ob Konto- oder Gerätedaten gelten, nichts überschreiben.
    if (!user || !sb || mergeRemote) return;
    clearTimeout(pushT);
    const { data, error } = await sb.from('user_state')
      .upsert({ user_id: user.id, data: snapshot(), updated_at: new Date().toISOString() })
      .select('updated_at').single();
    if (error) { failed(error); return; }
    meta.uid = user.id; meta.dirty = false; meta.remoteAt = data.updated_at; saveMeta();
    lastSaved = new Date(); setStatus('saved');
    if (courses.member.length) pushStats();
  }
  async function pushStats() {
    if (!user) return;
    await sb.from('member_stats').upsert({ user_id: user.id, stats: window.PVWeek.stats(), updated_at: new Date().toISOString() });
  }
  async function pull() {
    if (!user || !sb) return;
    const { data, error } = await sb.from('user_state').select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) { failed(error); return; }
    if (!data) { meta.uid = user.id; saveMeta(); return push(); } // Konto noch leer: Stand dieses Geräts übernehmen
    if (meta.uid !== user.id) {
      // Erste Anmeldung mit diesem Konto auf diesem Gerät
      if (localEmpty() || sameData(data.data)) { adopt(data); return; }
      mergeRemote = data; view = 'merge'; open(); return;
    }
    if (mergeRemote) return;
    if (meta.dirty) return push(); // ungespeicherte Änderungen dieses Geräts sind die neuesten
    if (Date.parse(data.updated_at) > Date.parse(meta.remoteAt || 0)) adopt(data);
    else { lastSaved = lastSaved || new Date(data.updated_at); setStatus('saved'); }
  }
  function adopt(row) {
    apply(row.data);
    meta.uid = user.id; meta.dirty = false; meta.remoteAt = row.updated_at; saveMeta();
    lastSaved = new Date(row.updated_at); setStatus('saved');
  }
  const sameData = d => { try { return JSON.stringify({ app: d.app, week: d.week }) === JSON.stringify({ app: snapshot().app, week: snapshot().week }); } catch (e) { return false; } };
  function failed(error) {
    const off = !navigator.onLine || /fetch|network/i.test(error && error.message || '');
    setStatus(off ? 'offline' : 'error');
    if (!off) console.warn('Synchronisierung:', error);
  }
  function setStatus(s) { status = s; updateButton(); if (dlg.open && view === 'main') renderStatusLine(); }

  window.addEventListener('online', () => { if (user) (meta.dirty ? push() : pull()); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && user) (meta.dirty ? push() : pull()); });
  window.addEventListener('pagehide', () => { if (user && meta.dirty) push(); });

  // ---------- Anmeldung ----------
  if (sb) {
    sb.auth.onAuthStateChange((event, session) => {
      const u = session ? session.user : null;
      if ((u && u.id) === (user && user.id)) return;
      user = u;
      // Supabase empfiehlt, im Callback selbst keine weiteren Abfragen zu starten.
      setTimeout(onUser, 0);
    });
  }
  async function onUser() {
    updateButton();
    if (user) {
      if (view === 'code') { view = 'main'; note = ''; }
      await loadCourses();
      await pull();
    } else {
      courses = { own: [], member: [], counts: {} }; dash = null; status = 'idle';
    }
    if (dlg.open) render();
  }
  async function sendCode(email) {
    busy = true; note = ''; render();
    const { error } = await sb.auth.signInWithOtp({
      email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname },
    });
    busy = false;
    if (error) { say(authError(error), true); return; }
    pendingEmail = email; view = 'code'; say(''); render();
    const inp = $('acCode'); if (inp) inp.focus();
  }
  async function verify(code) {
    busy = true; note = ''; render();
    const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token: code, type: 'email' });
    busy = false;
    if (error) { say('Der Code ist ungültig oder abgelaufen. Bitte prüfen oder einen neuen Code anfordern.', true); return; }
    // onAuthStateChange übernimmt den Rest
  }
  function authError(e) {
    const m = (e && e.message || '').toLowerCase();
    if (m.includes('rate') || m.includes('security purposes') || e.status === 429) return 'Zu viele Versuche. Bitte ein paar Minuten warten und dann erneut versuchen.';
    if (m.includes('not authorized') || m.includes('not allowed')) return 'Der E-Mail-Versand ist für diese Adresse noch nicht freigeschaltet. (Hinweis für den Betrieb: eigenen Mail-Dienst in Supabase einrichten.)';
    if (m.includes('invalid') && m.includes('email')) return 'Diese E-Mail-Adresse scheint ungültig zu sein.';
    if (!navigator.onLine) return 'Keine Internetverbindung.';
    return 'Das hat nicht geklappt: ' + (e.message || 'unbekannter Fehler');
  }
  function say(t, err) { note = t; noteErr = !!err; if (dlg.open) render(); }

  // ---------- Kurse ----------
  async function loadCourses() {
    if (!user) return;
    const [own, mem] = await Promise.all([
      sb.from('courses').select('id, code, name, created_at').eq('coach_id', user.id).order('created_at'),
      sb.from('course_members').select('course_id, display_name, joined_at, courses(name, code)').eq('user_id', user.id),
    ]);
    courses.own = own.data || [];
    courses.member = (mem.data || []).filter(m => m.courses);
    courses.counts = {};
    if (courses.own.length) {
      const { data } = await sb.from('course_members').select('course_id').in('course_id', courses.own.map(c => c.id));
      (data || []).forEach(r => { courses.counts[r.course_id] = (courses.counts[r.course_id] || 0) + 1; });
    }
  }
  async function createCourse(name) {
    busy = true; render();
    const { error } = await sb.rpc('create_course', { course_name: name });
    busy = false;
    if (error) { say('Kurs konnte nicht angelegt werden: ' + error.message, true); return; }
    await loadCourses(); say('Kurs angelegt. Den Code an die Teilnehmenden weitergeben.');
  }
  async function joinCourse(code, name) {
    busy = true; render();
    const { error } = await sb.rpc('join_course', { course_code: code, name });
    busy = false;
    if (error) { say(/nicht gefunden/i.test(error.message) ? 'Zu diesem Code gibt es keinen Kurs. Bitte den Code prüfen.' : 'Beitritt fehlgeschlagen: ' + error.message, true); return; }
    await loadCourses(); await pushStats(); say('Beigetreten. Die Kursleitung sieht ab jetzt Ihre Kennzahlen, keine Inhalte.');
  }
  async function leaveCourse(courseId) {
    if (!confirm('Kurs verlassen? Die Kursleitung sieht danach keine Kennzahlen mehr von Ihnen.')) return;
    await sb.from('course_members').delete().eq('course_id', courseId).eq('user_id', user.id);
    await loadCourses();
    if (!courses.member.length) await sb.from('member_stats').delete().eq('user_id', user.id);
    say('Kurs verlassen.');
  }
  async function openDash(courseId) {
    const course = courses.own.find(c => c.id === courseId);
    if (!course) return;
    busy = true; view = 'dash'; dash = { course, rows: [], q: '' }; render();
    const { data: mem } = await sb.from('course_members').select('user_id, display_name, joined_at').eq('course_id', courseId).order('display_name');
    const ids = (mem || []).map(m => m.user_id);
    const { data: st } = ids.length ? await sb.from('member_stats').select('user_id, stats, updated_at').in('user_id', ids) : { data: [] };
    const byId = Object.fromEntries((st || []).map(s => [s.user_id, s]));
    dash.rows = (mem || []).map(m => ({ ...m, stats: byId[m.user_id] ? byId[m.user_id].stats : null, updated_at: byId[m.user_id] ? byId[m.user_id].updated_at : null }));
    busy = false; render();
  }
  async function removeMember(userId, name) {
    if (!confirm(`${name} aus dem Kurs entfernen?`)) return;
    await sb.from('course_members').delete().eq('course_id', dash.course.id).eq('user_id', userId);
    await loadCourses(); await openDash(dash.course.id);
  }

  // ---------- Kopfzeile ----------
  function updateButton() {
    const b = $('acctBtn');
    if (!b) return;
    $('acctLabel').textContent = !sb ? 'Offline' : user ? 'Konto' : 'Anmelden';
    b.dataset.status = !sb ? 'offline' : user ? status : 'out';
    b.title = !sb ? 'Anmeldung gerade nicht verfügbar' : !user ? 'Anmelden, um auf mehreren Geräten zu planen' :
      status === 'saved' ? 'Im Konto gespeichert' : status === 'saving' ? 'Wird gespeichert …' : status === 'offline' ? 'Offline – wird später gespeichert' : status === 'error' ? 'Speichern fehlgeschlagen' : 'Angemeldet';
  }

  // ---------- Dialog ----------
  function open() { if (!dlg.open) { dlg.showModal(); } render(); }
  $('acctBtn').addEventListener('click', () => { view = mergeRemote ? 'merge' : user ? 'main' : view === 'code' ? 'code' : 'main'; note = ''; open(); });
  $('acctClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  const statusText = () => status === 'saved' ? `Im Konto gespeichert${lastSaved ? ' · ' + time(lastSaved) : ''}` :
    status === 'saving' ? 'Wird gespeichert …' : status === 'offline' ? 'Offline – wird gespeichert, sobald wieder Verbindung besteht' :
    status === 'error' ? 'Speichern fehlgeschlagen – wird erneut versucht' : 'Verbunden';
  function renderStatusLine() { const el = $('acStatus'); if (el) { el.textContent = statusText(); el.dataset.status = status; } }

  function render() {
    const body = $('acctBody');
    const n = note ? `<p class="ac-note${noteErr ? ' err' : ''}" role="status">${esc(note)}</p>` : '';
    const dis = busy ? 'disabled' : '';
    $('acctTitle').textContent = view === 'dash' && dash ? dash.course.name : user ? 'Konto' : 'Anmelden';
    dlg.classList.toggle('wide', view === 'dash');

    if (!sb) {
      body.innerHTML = `<p>Die Anmeldung ist gerade nicht verfügbar (keine Verbindung zum Server).</p>
        <p class="muted small">Die App funktioniert trotzdem. Alles wird auf diesem Gerät gespeichert.</p>` + installHtml();
      return;
    }
    if (!user && view !== 'code') {
      body.innerHTML = `<p>Mit einem Konto ist die Planung auf Handy und Computer gleich, und Sie können einem Kurs beitreten.</p>
        <form id="acMailForm" class="ac-form">
          <label class="field">E-Mail-Adresse
            <input type="email" id="acMail" autocomplete="email" inputmode="email" required placeholder="name@beispiel.de" value="${esc(pendingEmail)}">
          </label>
          <button class="primary go" ${dis}>Code senden</button>
        </form>
        <p class="muted small">Kein Passwort nötig: Sie bekommen einen Code per E-Mail. Neu hier? Dann wird das Konto dabei automatisch angelegt.</p>
        ${n}${installHtml()}
        <p class="muted small ac-legal"><a href="datenschutz.html">Datenschutz</a> · <a href="impressum.html">Impressum</a></p>`;
      $('acMail').focus();
      return;
    }
    if (!user && view === 'code') {
      body.innerHTML = `<p>Wir haben einen Code an <b>${esc(pendingEmail)}</b> geschickt.</p>
        <form id="acCodeForm" class="ac-form">
          <label class="field">Code aus der E-Mail
            <input type="text" id="acCode" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6,10}" maxlength="10" required placeholder="123456" class="ac-code">
          </label>
          <button class="primary go" ${dis}>Anmelden</button>
        </form>
        ${n}
        <p class="muted small">Keine E-Mail? Bitte auch im Spam-Ordner nachsehen. Der Code gilt eine Stunde.</p>
        <p class="ac-row"><button type="button" class="mini" data-a="resend" ${dis}>Neuen Code senden</button><button type="button" class="mini" data-a="otherMail">Andere E-Mail-Adresse</button></p>`;
      return;
    }
    if (view === 'merge' && mergeRemote) {
      body.innerHTML = `<p>Auf diesem Gerät und in Ihrem Konto liegen <b>unterschiedliche Daten</b>. Welche sollen gelten?</p>
        <p class="muted small">Im Konto zuletzt gespeichert: ${date(mergeRemote.updated_at)}, ${time(new Date(mergeRemote.updated_at))}</p>
        <div class="ac-choice">
          <button type="button" class="primary" data-a="useRemote">Daten aus dem Konto laden</button>
          <button type="button" data-a="useLocal">Daten dieses Geräts ins Konto übernehmen</button>
        </div>
        <p class="muted small">Die jeweils anderen Daten werden ersetzt. Wer sichergehen will, speichert vorher unten auf der Seite eine Sicherung („Sitzung speichern“).</p>`;
      return;
    }
    if (view === 'dash' && dash) { body.innerHTML = dashHtml(); return; }

    // Angemeldet: Übersicht
    const own = courses.own.map(c => `<li><div><b>${esc(c.name)}</b><br><span class="muted small">Code <code class="ac-codechip">${esc(c.code)}</code> · ${courses.counts[c.id] || 0} Teilnehmende</span></div>
      <div class="ac-row"><button type="button" class="mini" data-a="copy" data-code="${esc(c.code)}">Code kopieren</button><button type="button" class="mini primary" data-a="dash" data-id="${c.id}">Auswertung</button></div></li>`).join('');
    const mem = courses.member.map(m => `<li><div><b>${esc(m.courses.name)}</b><br><span class="muted small">als „${esc(m.display_name)}“ · seit ${date(m.joined_at)}</span></div>
      <button type="button" class="mini" data-a="leave" data-id="${m.course_id}">Verlassen</button></li>`).join('');
    body.innerHTML = `
      <p class="ac-user"><span class="muted small">Angemeldet als</span><br><b>${esc(user.email)}</b></p>
      <p class="ac-status" id="acStatus" data-status="${status}">${esc(statusText())}</p>
      ${n}
      <section class="ac-sec">
        <h3>Kurs beitreten</h3>
        ${mem ? `<ul class="ac-list">${mem}</ul>` : ''}
        <form id="acJoinForm" class="ac-form ac-grid">
          <label class="field">Kurscode<input type="text" id="acJoinCode" required placeholder="PRIO-XXXX" autocapitalize="characters" autocomplete="off"></label>
          <label class="field">Name im Kurs<input type="text" id="acJoinName" required maxlength="60" placeholder="z. B. Vorname"></label>
          <label class="check ac-consent"><input type="checkbox" id="acConsent" required> <span>Die Kursleitung darf meine <b>Kennzahlen</b> sehen (z. B. Anzahl Projekte, geplante Stunden, Erledigungsquote, Verschiebungen). <b>Projektnamen, Beschreibungen und Priorisierungen bleiben privat.</b> Widerruf jederzeit durch Verlassen des Kurses.</span></label>
          <button class="primary" ${dis}>Beitreten</button>
        </form>
      </section>
      <section class="ac-sec">
        <h3>Eigene Kurse <span class="muted small">(für Coaches)</span></h3>
        ${own ? `<ul class="ac-list">${own}</ul>` : '<p class="muted small">Noch keine eigenen Kurse.</p>'}
        <form id="acNewForm" class="ac-form ac-inline">
          <input type="text" id="acNewName" required maxlength="80" placeholder="Name des Kurses" aria-label="Name des Kurses">
          <button class="mini primary add" ${dis}>Kurs anlegen</button>
        </form>
      </section>
      ${installHtml()}
      <section class="ac-sec ac-end">
        <div class="ac-row">
          <button type="button" class="mini" data-a="logout">Abmelden</button>
          <button type="button" class="mini" data-a="logoutWipe">Abmelden und Daten auf diesem Gerät löschen</button>
        </div>
        <p class="ac-row"><button type="button" class="link danger" data-a="delete">Konto löschen</button><span class="muted small"><a href="datenschutz.html">Datenschutz</a> · <a href="impressum.html">Impressum</a></span></p>
      </section>`;
  }

  function installHtml() {
    if (standalone()) return '';
    if (installEvt) return '<section class="ac-sec ac-install"><button type="button" class="mini" data-a="install">Als App installieren</button><span class="muted small">Dann startet prio wie eine App vom Startbildschirm, auch offline.</span></section>';
    if (isIOS()) return '<section class="ac-sec ac-install"><span class="muted small"><b>Als App nutzen:</b> In Safari unten auf „Teilen“ <span aria-hidden="true">⎋</span> tippen, dann „Zum Home-Bildschirm“.</span></section>';
    return '';
  }

  // Coach-Auswertung: nur Kennzahlen, keine Inhalte
  function dashHtml() {
    const d = dash, q = d.q.trim().toLowerCase();
    if (busy) return '<p class="muted">Lade Auswertung …</p>';
    const rows = d.rows.filter(r => !q || r.display_name.toLowerCase().includes(q));
    const S = r => r.stats || {};
    const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '–';
    const avg = f => { const v = d.rows.map(f).filter(x => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const fresh = r => r.updated_at ? date(r.updated_at) : 'noch keine Daten';
    const doneW = s => (s.done || 0) + (s.more || 0);
    const head = `<tr><th>Name</th><th>Stand</th><th class="num">KW</th><th class="num">Projekte</th><th class="num">geplant / verfügbar</th>
      <th class="num">erledigt (Woche)</th><th class="num">erledigt (4 Wo.)</th><th class="num">mit mehr Zeit</th><th class="num">Ø Verschieb.</th>
      <th class="num">offen verschoben</th><th class="num">privat</th><th class="num">Vergleiche</th><th></th></tr>`;
    const line = r => { const s = S(r); return `<tr>
      <td class="kw"><b>${esc(r.display_name)}</b></td><td class="muted small">${fresh(r)}</td>
      <td class="num">${s.kw || '–'}</td><td class="num">${s.projects ?? '–'}</td>
      <td class="num ${s.available && s.planned / s.available >= 1 ? 'over' : ''}">${s.planned != null ? fmt(s.planned) + ' h' + (s.available ? ' / ' + fmt(s.available) + ' h' : '') : '–'}</td>
      <td class="num">${s.projects ? doneW(s) + ' von ' + s.projects : '–'}</td>
      <td class="num">${s.done_4w ?? '–'}</td><td class="num">${s.done_4w ? pct(s.more_4w, s.done_4w) : '–'}</td>
      <td class="num">${fmt(s.avg_shifts_done_4w)}</td><td class="num">${s.backlog ?? '–'}</td>
      <td class="num">${s.private_share != null ? s.private_share + ' %' : '–'}</td><td class="num">${s.comparisons ?? '–'}</td>
      <td><button type="button" class="mini" data-a="remove" data-id="${r.user_id}" data-name="${esc(r.display_name)}" title="Aus dem Kurs entfernen">×</button></td></tr>`; };
    const n = d.rows.length;
    const sum = n ? `<tr class="ac-sum"><td><b>Kurs (Ø)</b></td><td></td><td></td><td class="num">${fmt(avg(r => S(r).projects))}</td>
      <td class="num">${fmt(avg(r => S(r).planned))} / ${fmt(avg(r => S(r).available))} h</td><td class="num">${fmt(avg(r => S(r).projects ? doneW(S(r)) : null))}</td>
      <td class="num">${fmt(avg(r => S(r).done_4w))}</td><td class="num">${(() => { const a = avg(r => S(r).done_4w ? 100 * S(r).more_4w / S(r).done_4w : null); return a == null ? '–' : Math.round(a) + ' %'; })()}</td>
      <td class="num">${fmt(avg(r => S(r).avg_shifts_done_4w))}</td><td class="num">${fmt(avg(r => S(r).backlog))}</td>
      <td class="num">${(() => { const a = avg(r => S(r).private_share); return a == null ? '–' : Math.round(a) + ' %'; })()}</td><td class="num">${fmt(avg(r => S(r).comparisons))}</td><td></td></tr>` : '';
    return `<p class="ac-row"><button type="button" class="mini back" data-a="back">Zurück</button>
        <span class="muted small">Code <code class="ac-codechip">${esc(d.course.code)}</code> · ${n} Teilnehmende</span>
        <button type="button" class="mini" data-a="copy" data-code="${esc(d.course.code)}">Code kopieren</button>
        <button type="button" class="mini" data-a="dash" data-id="${d.course.id}">Aktualisieren</button></p>
      <input type="search" id="acSearch" class="ac-search" placeholder="Teilnehmende suchen …" value="${esc(d.q)}" aria-label="Teilnehmende suchen">
      ${n ? `<div class="scroll"><table class="rank ac-dash"><thead>${head}</thead><tbody>${rows.map(line).join('') || '<tr><td colspan="13" class="muted">Keine Treffer.</td></tr>'}${q ? '' : sum}</tbody></table></div>`
        : '<p class="muted">Noch niemand beigetreten. Den Code an die Teilnehmenden weitergeben: Sie treten unter „Konto → Kurs beitreten“ bei.</p>'}
      <p class="muted small">Sichtbar sind nur Kennzahlen, die die Teilnehmenden mit dem Beitritt freigegeben haben. Inhalte der Planungen sind für die Kursleitung technisch nicht abrufbar. „Stand“ = letzte Aktualisierung; Kennzahlen beziehen sich auf die aktuell geplante Woche bzw. die letzten vier Wochen.</p>`;
  }

  // ---------- Eingaben im Dialog ----------
  $('acctBody').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.id;
    if (f === 'acMailForm') { const v = $('acMail').value.trim(); if (v) sendCode(v); }
    else if (f === 'acCodeForm') { const v = $('acCode').value.replace(/\s/g, ''); if (v) verify(v); }
    else if (f === 'acJoinForm') joinCourse($('acJoinCode').value.trim(), $('acJoinName').value.trim());
    else if (f === 'acNewForm') createCourse($('acNewName').value.trim());
  });
  $('acctBody').addEventListener('input', e => {
    if (e.target.id === 'acSearch' && dash) {
      dash.q = e.target.value; const pos = e.target.selectionStart;
      render(); const s = $('acSearch'); s.focus(); s.setSelectionRange(pos, pos);
    }
  });
  $('acctBody').addEventListener('click', async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'resend') sendCode(pendingEmail);
    else if (a === 'otherMail') { view = 'main'; note = ''; render(); }
    else if (a === 'useRemote') { adopt(mergeRemote); mergeRemote = null; view = 'main'; say('Daten aus dem Konto geladen.'); }
    else if (a === 'useLocal') { mergeRemote = null; view = 'main'; meta.uid = user.id; meta.dirty = true; saveMeta(); await push(); say('Daten dieses Geräts ins Konto übernommen.'); }
    else if (a === 'copy') { try { await navigator.clipboard.writeText(b.dataset.code); say(`Code ${b.dataset.code} kopiert.`); } catch (err) { say(`Code: ${b.dataset.code}`); } }
    else if (a === 'dash') openDash(b.dataset.id);
    else if (a === 'back') { view = 'main'; dash = null; render(); }
    else if (a === 'remove') removeMember(b.dataset.id, b.dataset.name);
    else if (a === 'leave') leaveCourse(b.dataset.id);
    else if (a === 'install' && installEvt) { installEvt.prompt(); installEvt = null; render(); }
    else if (a === 'logout' || a === 'logoutWipe') {
      if (a === 'logoutWipe' && !confirm('Abmelden und alle Daten auf diesem Gerät löschen? Im Konto bleiben sie erhalten.')) return;
      if (meta.dirty) await push();
      await sb.auth.signOut();
      if (a === 'logoutWipe') {
        ['paarvergleich-v1', 'wochenplanung-v1', META_KEY].forEach(k => { try { localStorage.removeItem(k); } catch (err) { /* egal */ } });
        location.reload(); return;
      }
      delete meta.uid; meta.dirty = false; saveMeta();
      view = 'main'; say('Abgemeldet. Die Daten bleiben auf diesem Gerät.');
    }
    else if (a === 'delete') {
      if (!confirm('Konto endgültig löschen? Alle im Konto gespeicherten Daten und Kurse werden gelöscht. Das lässt sich nicht rückgängig machen.')) return;
      if (!confirm('Wirklich löschen?')) return;
      const { error } = await sb.rpc('delete_my_account');
      if (error) { say('Löschen fehlgeschlagen: ' + error.message, true); return; }
      await sb.auth.signOut();
      delete meta.uid; meta.dirty = false; saveMeta();
      view = 'main'; say('Konto gelöscht. Die Daten auf diesem Gerät sind noch da; „Neu beginnen“ entfernt sie.');
    }
  });

  updateButton();
  window.PVSync = { touch, push, pull, isSignedIn: () => !!user };
})();
