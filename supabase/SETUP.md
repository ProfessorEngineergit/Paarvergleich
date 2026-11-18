# Supabase einrichten (prio.coach)

Projekt: `https://pgrmocknvafzsqxkaccd.supabase.co` (Region Frankfurt)

## 1. Datenbank anlegen

Supabase Dashboard → **SQL Editor** → **New query** → den kompletten Inhalt von
[`schema.sql`](https://raw.githubusercontent.com/ProfessorEngineergit/Paarvergleich/main/supabase/schema.sql)
einfügen → **Run**.

Erwartet: „Success. No rows returned“. Das Skript kann bei Bedarf erneut ausgeführt werden.
Fragt Supabase nach einer Bestätigung wegen „destructive operations“ (wegen der `drop policy if exists`-Zeilen), bestätigen: Es werden nur die Regeln dieses Skripts neu gesetzt, keine Daten gelöscht.

## 2. Anmeldung per Code statt Link

**Authentication → Emails** (bzw. „Email Templates“). In **beiden** Vorlagen **Magic Link** und **Confirm signup** jeweils Betreff und Text ersetzen:

Betreff:

```
Ihr Anmeldecode für prio.coach: {{ .Token }}
```

Text (Source/HTML):

```html
<h2>Ihr Anmeldecode</h2>
<p>Geben Sie diesen Code in prio.coach ein:</p>
<p style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:16px 0">{{ .Token }}</p>
<p>Der Code gilt eine Stunde. Wenn Sie keine Anmeldung angefordert haben, können Sie diese E-Mail ignorieren.</p>
<p style="color:#888;font-size:12px">prio.coach · panlogos GmbH</p>
```

Speichern.

## 3. Adressen

**Authentication → URL Configuration**

- **Site URL:** `https://prio.coach`
- **Redirect URLs** hinzufügen:
  - `https://prio.coach/**`
  - `https://professorengineergit.github.io/Paarvergleich/**`

## 4. Vor dem Start mit Teilnehmenden: eigener Mail-Versand

Der eingebaute Mailversand von Supabase schickt Codes nur an Mitglieder des Supabase-Teams
und nur wenige pro Stunde. Zum Testen mit der eigenen Adresse reicht das. Für den Kurs:

1. Konto bei einem Versanddienst (z. B. Brevo) anlegen, Domain `prio.coach` hinzufügen und die angezeigten DNS-Einträge (SPF, DKIM, DMARC) bei IONOS eintragen.
2. Supabase → **Authentication → Emails → SMTP Settings** → „Enable custom SMTP“:
   - Sender email: `login@prio.coach`, Sender name: `prio.coach`
   - Host, Port, Benutzer, Passwort: aus dem Versanddienst (SMTP-Zugangsdaten)
3. **Authentication → Rate Limits**: „Rate limit for sending emails“ z. B. auf 100 pro Stunde erhöhen.

## 5. Domain (GitHub Pages)

Sobald `prio.coach` im DNS auf GitHub zeigt, liegt im Repository eine Datei `CNAME` mit `prio.coach`.
Danach in GitHub → Repository → **Settings → Pages** „Enforce HTTPS“ aktivieren (sobald das Zertifikat bereitsteht, kann das bis zu einer Stunde dauern).
