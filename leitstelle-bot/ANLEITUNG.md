# Leitstelle – ER:LC Discord-Bot

Ein vollständiger Discord-Bot für deutsche ER:LC-Communities: Sessions, automatisches Statuspanel, Ingame-Befehle über die offizielle ER:LC API, Abteilungen, Modmail, Bewerbungen, Moderation, Team-Verwaltung, Verifizierung, Ankündigungen und Community-Funktionen.

Alles wird direkt in Discord eingerichtet. Der Name „Leitstelle“ ist nur ein Platzhalter und lässt sich mit `/config allgemein` ändern.

---

## 1. Voraussetzungen

- **Node.js 18.17 oder neuer** (empfohlen: Node 20 oder 22)
- Ein Discord-Bot im [Discord Developer Portal](https://discord.com/developers/applications)
- Ein privater ER:LC-Server mit **ER:LC API-Zugang** (Server-Key)

## 2. Bot im Discord Developer Portal anlegen

1. **New Application** → Namen vergeben.
2. Links **Bot** öffnen → **Reset Token** → Token kopieren (niemals weitergeben!).
3. Unter **Privileged Gateway Intents** einschalten:
   - **Server Members Intent**
   - **Message Content Intent**
4. Links **OAuth2 → URL Generator**: Scopes `bot` und `applications.commands`, Berechtigung **Administrator** (oder mindestens: Kanäle/Rollen verwalten, Mitglieder kicken/bannen/timeouten, Nachrichten verwalten, Nachrichten senden, Links einbetten, Dateien anhängen, Reaktionen hinzufügen).
5. Mit dem erzeugten Link den Bot auf deinen Server einladen.
6. **Wichtig:** In den Servereinstellungen die Bot-Rolle **über** alle Rollen ziehen, die der Bot vergeben soll (Abteilungen, Ränge, Verifiziert usw.).

## 3. ER:LC Server-Key besorgen

Im Spiel auf deinem privaten Server: **Einstellungen → ER:LC API** → Key erstellen bzw. kopieren. Der Key gibt Zugriff auf deinen Server – nur in die `.env` eintragen, nirgendwo sonst.

## 4. Installation

### Auf altare.gg (oder einem anderen Node-Hoster)

1. Neuen **Node.js**-Server anlegen (Version 18 oder neuer).
2. Die ZIP-Datei hochladen und im Dateimanager **entpacken**.
3. `.env.example` in **`.env`** umbenennen und ausfüllen (siehe unten).
4. Als Startdatei `index.js` eintragen (bzw. Startbefehl `npm start`).
5. Server starten. Die Pakete werden beim ersten Start mit `npm install` installiert – falls dein Hoster das nicht automatisch macht, einmal `npm install` in der Konsole ausführen.

### Lokal / auf eigenem Server

```bash
npm install
cp .env.example .env    # danach .env ausfüllen
npm start
```

### Die `.env`-Datei

| Variable | Pflicht | Inhalt |
|---|---|---|
| `DISCORD_TOKEN` | ja | Bot-Token aus dem Developer Portal |
| `GUILD_ID` | ja | ID deines Discord-Servers (Entwicklermodus an → Rechtsklick auf Server → ID kopieren) |
| `ERLC_API_KEY` | ja | Server-Key aus ER:LC |
| `ERLC_GLOBAL_KEY` | nein | Nur nötig, wenn PRC dir einen globalen Schlüssel gegeben hat |

Geheime Schlüssel stehen **nur** in der `.env`. Der Bot zeigt sie nie in Discord an.

## 5. Start

Nach dem Start erscheint in der Konsole „… Befehle registriert“. Die Slash-Befehle sind sofort auf deinem Server verfügbar.

Selbsttest ohne Discord-Verbindung (prüft alle Dateien und Befehle): `npm run check`

**Daten:** Alles wird in `data/bot.db` gespeichert (SQLite). Diese Datei bei Updates **nicht löschen** – sonst sind Sessions, Abteilungen, Verwarnungen usw. weg. Logs liegen täglich in `logs/`.

**Update:** Neue Dateien hochladen und überschreiben, dabei `.env` und `data/` behalten, dann neu starten.

---

## 6. Einrichtung in Discord

### Schnellstart

1. **`/setup`** ausführen. Der Assistent führt durch Kanäle und Rollen und kann fehlende Kanäle automatisch anlegen.
2. **Berechtigungsgruppen** festlegen mit `/config berechtigung` (siehe unten).
3. Statuspanel: `/setchannel art:ER:LC-Statuskanal` – das Panel erscheint automatisch und aktualisiert sich selbst.
4. Je nach Bedarf Panels senden: `/modmail setup`, `/bewerbung panel`, `/verifizierung panel`, `/warteschlange panel`, `/rollenpanel`, `/infopanel`.
5. `/config anzeigen` zeigt jederzeit alle Einstellungen.

### Berechtigungsgruppen

Jeder Befehl gehört standardmäßig zu einer oder mehreren Gruppen. Mit `/config berechtigung` ordnest du deinen Discord-Rollen Gruppen zu.

| Gruppe | Typische Rolle | Darf standardmäßig |
|---|---|---|
| **Administration** | Owner, Admins | Alles. Automatisch: Serverinhaber und alle mit Discord-Administratorrecht |
| **Community-Management** | Management | Alles außer reinen Admin-Befehlen (z. B. Bann, Konfiguration) |
| **Server-Management (ER:LC)** | Server-Leitung | Ingame-Befehle, Serveraktionen, Sessions |
| **Session-Host** | Hosts | Sessions starten/verwalten, Ingame-Ankündigungen |
| **Abteilungsleitung** | Department-Leitung | Mitglieder der eigenen Abteilung verwalten (nur unterhalb des eigenen Rangs) |
| **Moderationsteam** | Moderatoren | Moderation, Ingame-Kick, Modmail |
| **Supportteam** | Support | Modmail, Team-Ansicht |

Grundregeln: **Moderatoren dürfen kicken, nur die Administration darf bannen** (Discord und ER:LC).

**Ausnahmen pro Befehl:** `/config befehl befehl:<name> modus:<…>` – z. B. einen Befehl deaktivieren, nur für Admins freigeben oder für alle öffnen. `/config befehle` listet alle Befehle mit ihren Gruppen. Modus **Standard** stellt den Ursprungszustand wieder her.

### Kanäle (`/setchannel`, `/setlogchannel`)

Session-Kanal, ER:LC-Statuskanal, Session-Log, ER:LC-Befehlslog, Modmail-Kategorie, Modmail-Log, Bewerbungs-Auswertung, Bewerbungs-Log, Moderations-Log, Allgemeines Log, Team-Log, Abteilungs-Log, Verifizierungs-Log, Willkommenskanal, Abschiedskanal, Ankündigungskanal, Vorschlagskanal, Level-Benachrichtigungen, Warteschlangen-Kanal.

Ist ein spezielles Log nicht gesetzt, landet der Eintrag im **Allgemeinen Log**.

### Rollen (`/setrole`)

Für Session-Pings, Verifizierung, Auto-Rollen beim Beitritt usw. Abteilungs- und Rangrollen werden über `/department setrole` gesetzt, Team-Ränge über `/staff raenge`.

### Aussehen & Texte

- `/setcolor` – Farben der Embeds
- `/config allgemein` – Name (Branding) und Logo
- `/config vorlage` bzw. `/session customize` – alle Texte (Session-Meldungen, Willkommen, Ankündigungen, Modmail, Level-Up) mit Platzhaltern wie `{host}`, `{spieler}`, `{max}`, `{code}`, `{user}`
- `/resetconfig` – Bereiche auf Standard zurücksetzen (mit Bestätigung)

---

## 7. Die Systeme im Überblick

**ER:LC & Statuspanel** – Live-Daten direkt aus der offiziellen API (Spieler, Warteschlange, Team, Logs). Das Statuspanel aktualisiert sich automatisch (Standard: alle 60 Sekunden, einstellbar mit `/config erlc`). Sind keine Live-Daten verfügbar, steht das ehrlich im Panel – es werden nie alte Zahlen als aktuell angezeigt.

**Sessions** – `/session start` öffnet ein Formular mit Vorschau, danach wird die Session veröffentlicht. Status (Vorbereitung, gestartet, aktiv, Verstärkung benötigt, fast voll, pausiert, beendet, offline) wechselt teils automatisch anhand der Spielerzahl. Buttons für Spieler: Server beitreten, Servercode, Infos, Regeln, Host, Statistiken. Statistiken, Verlauf und Host-Rangliste werden gespeichert.

**Hosts** – Host und Co-Host, Übergabe, Statistiken und Rangliste über `/host`.

**Warteschlange (Discord)** – Eine optionale Discord-Warteliste mit Panel und Benachrichtigung per DM. Sie ist **unabhängig** von der Ingame-Warteschlange, das steht auch im Panel.

**Abteilungen** – Standard: LSPD, BCSO, FD, EMS, DOT, Zivil – jeweils mit Rängen. Abteilungen und Ränge frei anpassbar. Rollen werden automatisch vergeben, die Dienstliste aktualisiert sich selbst. Trainings mit Anmeldung und Anwesenheit.

**Modmail** – Spieler öffnen über das Panel oder per Privatnachricht an den Bot eine Unterhaltung. Das Team antwortet im privaten Kanal; Nachrichten mit `//` am Anfang bleiben intern. Sind die DMs der Person geschlossen, erklärt der Bot, wie sie sie öffnet. Beim Schließen gibt es ein Transkript im Log.

**Bewerbungen** – 8 Kategorien mit eigenen Fragen (`/bewerbung fragen`), Prüfung mit Annehmen/Ablehnen/Notiz, Wartezeit nach Ablehnung, automatische Rollen und bei Abteilungs-Bewerbungen automatische Aufnahme.

**Moderation** – Alle Aktionen werden gespeichert und geloggt, betroffene Personen per DM informiert. Rollen-Hierarchie wird beachtet.

**Team (Staff)** – Team-Ränge, Dienstzeit (`/staff duty`), Aktivität, Verwarnungen und Rangliste.

**Verifizierung** – Rechenaufgabe gegen Bots, Mindest-Kontoalter einstellbar, Logs.

**Ankündigungen** – Allgemein, Session, Abteilung, Notfall, Wartung – sofort oder geplant („in 2h“, „20:00“, „24.12.2026 18:30“, deutsche Zeit).

**Community** – Willkommen/Abschied, Vorschläge mit Abstimmung, Umfragen, Giveaways, Reaktionsrollen, Level-System, Server-Statistik-Kanäle, Auto-Rollen, Info-Panels und Textbausteine.

---

## 8. Grenzen der ER:LC API (wichtig)

Der Bot nutzt ausschließlich echte Funktionen der offiziellen API – nichts wird vorgetäuscht.

- **Kein Server-Lock über die API.** `/session lock` sperrt die Session in Discord und blendet den Servercode aus; ingame bleibt der Server offen.
- **Kein offizieller Beitrittslink.** Der „Server beitreten“-Button zeigt eine Anleitung mit Servercode. Einen eigenen Link kannst du mit `/config erlc` hinterlegen.
- **Ingame-Befehle: max. 1 alle 5 Sekunden.** Der Bot reiht Befehle automatisch ein, deshalb kann eine Antwort kurz dauern.
- Manche Befehle sind von ER:LC für die API **gesperrt** (Fehler 4002) – der Bot meldet das verständlich.
- Ist der Server offline, kommen keine Live-Daten; Panel und Befehle zeigen das an.
- Die Ingame-Warteschlange kann nur **angezeigt**, nicht gesteuert werden.

## 9. Häufige Probleme

| Problem | Lösung |
|---|---|
| Befehle erscheinen nicht | `GUILD_ID` prüfen, Bot mit Scope `applications.commands` einladen, Discord neu laden |
| „Mir fehlt die Berechtigung …“ | Bot-Rolle in der Rollenliste nach oben ziehen bzw. Recht vergeben |
| „Ungültiger API-Key“ | `ERLC_API_KEY` in der `.env` prüfen; nach einer Änderung neu starten |
| Statuspanel zeigt „Live-Daten nicht verfügbar“ | ER:LC-Server ist offline oder die API ist kurz nicht erreichbar – aktualisiert sich von selbst |
| Rollen werden nicht vergeben | Server Members Intent aktivieren; Bot-Rolle über die Zielrollen ziehen |
| Modmail-DMs kommen nicht an | Person muss DMs von Servermitgliedern erlauben |

---

## 10. Befehlsübersicht

`[option]` = optional. Die Spalte „Berechtigt“ zeigt den Standard; mit `/config befehl` änderbar. Die Administration darf immer alles, das Community-Management alles außer Admin-Befehlen. `/hilfe` zeigt im Discord, welche Befehle du selbst nutzen darfst.

### ER:LC

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/erlc status`  | Zeigt den aktuellen Serverstatus | Alle |
| `/erlc info`  | Zeigt ausführliche Serverinformationen | Alle |
| `/erlc players` `[team]` | Zeigt alle Spieler auf dem Server | Alle |
| `/erlc servercode`  | Zeigt den Servercode zum Beitreten | Alle |
| `/erlc queue`  | Zeigt die Ingame-Warteschlange | Alle |
| `/erlc refresh`  | Lädt alle Live-Daten neu (Statuspanel & Session) | Server-Management (ER:LC), Session-Host, Moderationsteam |
| `/erlc team`  | Zeigt das Ingame-Team (Admins, Mods, Helfer) | Server-Management (ER:LC), Moderationsteam, Supportteam |
| `/erlc logs` `art` | Zeigt Ingame-Protokolle | Server-Management (ER:LC), Moderationsteam |
| `/erlc announce` `nachricht` | Sendet eine Ingame-Nachricht an alle Spieler (:m) | Server-Management (ER:LC), Session-Host |
| `/erlc hinweis` `nachricht` | Zeigt allen Spielern einen Hinweis am Bildschirmrand (:h) | Server-Management (ER:LC), Session-Host |
| `/erlc pm` `spieler` `nachricht` | Sendet einem Spieler eine private Ingame-Nachricht (:pm) | Server-Management (ER:LC), Moderationsteam |
| `/erlc kick` `spieler` `grund` | Kickt einen Spieler vom ER:LC Server | Server-Management (ER:LC), Moderationsteam |
| `/erlc ban` `spieler` `grund` | Bannt einen Spieler vom ER:LC Server | Administration |
| `/erlc unban` `spieler` `[grund]` | Entbannt einen Spieler auf dem ER:LC Server | Administration |
| `/erlc spieler` `aktion` `spieler` | Führt eine Spieleraktion ingame aus | Server-Management (ER:LC), Moderationsteam |
| `/erlc server` `aktion` `[wert]` | Ändert Servereinstellungen ingame | Server-Management (ER:LC) |
| `/erlc befehl` `befehl` | Führt einen beliebigen Ingame-Befehl aus (nur Administration) | Administration |
| `/erlc panel`  | Richtet das automatische Statuspanel in diesem Kanal ein | Administration |

### Sessions, Hosts & Warteschlange

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/host start` `rolle` `[nutzer]` | Übernimmt das Hosting der laufenden Session | Session-Host |
| `/host end`  | Beendet dein Co-Hosting bzw. trägt den Co-Host aus | Session-Host |
| `/host transfer` `nutzer` | Überträgt die Host-Rechte an eine andere Person | Session-Host |
| `/host info`  | Zeigt Host und Co-Host der laufenden Session | Alle |
| `/host history` `[nutzer]` | Zeigt den Hosting-Verlauf einer Person | Alle |
| `/host stats` `[nutzer]` | Zeigt Hosting-Statistiken einer Person | Alle |
| `/host leaderboard` `[kriterium]` | Rangliste der Hosts | Alle |
| `/session start` `name` `typ` `[cohost]` `[host]` `[mindestspieler]` `[bild]` `[vorbereitung]` `[ping]` | Startet eine neue ER:LC-Session | Session-Host |
| `/session end` `[grund]` `[ingame]` | Beendet die laufende Session | Session-Host |
| `/session shutdown` `grund` `[ingame]` | Fährt die Session herunter (mit Shutdown-Ankündigung) | Session-Host |
| `/session status` `[setzen]` | Zeigt oder ändert den Session-Status | Alle |
| `/session boost` `[ping]` | Ruft zur Verstärkung auf (Status + Ankündigung) | Session-Host |
| `/session low` `[ping]` | Meldet eine geringe Spielerzahl | Session-Host |
| `/session full`  | Meldet, dass der Server fast voll ist | Session-Host |
| `/session lock`  | Sperrt die Session für neue Spieler | Session-Host |
| `/session unlock`  | Hebt die Sperre der Session auf | Session-Host |
| `/session setcode` `code` | Ändert den Servercode der Session | Session-Host |
| `/session announce` `nachricht` `[ping]` | Sendet eine Ankündigung zur laufenden Session | Session-Host |
| `/session stats` `[zeitraum]` | Zeigt Session-Statistiken | Alle |
| `/session history` `[host]` `[seite]` | Zeigt vergangene Sessions | Alle |
| `/session leaderboard` `[kriterium]` `[zeitraum]` | Rangliste der Session-Hosts | Alle |
| `/session customize`  | Session-Texte, Standardwerte oder die laufende Session anpassen | Session-Host |
| `/warteschlange panel`  | Erstellt das Warteschlangen-Panel in diesem Kanal | Community-Management |
| `/warteschlange liste`  | Zeigt alle Wartenden | Alle |
| `/warteschlange aufrufen` `[nutzer]` | Ruft die nächste Person (oder eine bestimmte) auf | Session-Host, Moderationsteam, Supportteam |
| `/warteschlange entfernen` `nutzer` | Entfernt eine Person aus der Warteschlange | Session-Host, Moderationsteam, Supportteam |
| `/warteschlange leeren`  | Leert die gesamte Warteschlange | Session-Host, Community-Management |
| `/warteschlange stats`  | Statistiken der Warteschlange | Session-Host, Moderationsteam, Supportteam |

### Abteilungen

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/department create` `kuerzel` `name` `[rolle]` `[emoji]` `[farbe]` | Erstellt eine neue Abteilung | Community-Management |
| `/department delete` `abteilung` | Löscht eine Abteilung | Community-Management |
| `/department add` `nutzer` `abteilung` `[rang]` `[dienstnummer]` | Nimmt ein Mitglied in eine Abteilung auf | Abteilungsleitung |
| `/department remove` `nutzer` `abteilung` `[grund]` | Entfernt ein Mitglied aus einer Abteilung | Abteilungsleitung |
| `/department promote` `nutzer` `abteilung` `[rang]` `[grund]` | Befördert ein Mitglied | Abteilungsleitung |
| `/department demote` `nutzer` `abteilung` `[rang]` `[grund]` | Degradiert ein Mitglied | Abteilungsleitung |
| `/department info` `[abteilung]` `[nutzer]` | Zeigt Infos zu einer Abteilung oder einem Mitglied | Alle |
| `/department list`  | Zeigt alle Abteilungen | Alle |
| `/department roster` `abteilung` `[kanal]` | Zeigt die Dienstliste oder richtet eine automatische Dienstliste ein | Alle |
| `/department rename` `abteilung` `name` `[kuerzel]` | Benennt eine Abteilung um | Community-Management |
| `/department setleader` `abteilung` `[nutzer]` | Legt die Leitung einer Abteilung fest | Community-Management |
| `/department setrole` `abteilung` `[rolle]` `[rang]` | Legt die Discord-Rolle einer Abteilung oder eines Rangs fest | Community-Management |
| `/department rank` `aktion` `abteilung` `[rang]` `[name]` `[position]` | Ränge einer Abteilung verwalten | Community-Management |
| `/department stats` `abteilung` | Statistiken einer Abteilung | Abteilungsleitung |
| `/department announce` `abteilung` `nachricht` `[kanal]` `[ping]` | Sendet eine Ankündigung an eine Abteilung | Abteilungsleitung |
| `/department training` `abteilung` `titel` `zeitpunkt` `[beschreibung]` `[kanal]` | Plant ein Training mit Anmeldung und Anwesenheit | Abteilungsleitung |

### Modmail

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/modmail setup` `[kategorie]` `[log]` | Richtet Modmail ein und sendet das Support-Panel in diesen Kanal | Administration |
| `/modmail close` `[grund]` | Schließt die Unterhaltung in diesem Kanal | Supportteam, Moderationsteam |
| `/modmail reopen` `nutzer` | Öffnet die letzte Unterhaltung eines Nutzers erneut | Supportteam, Moderationsteam |
| `/modmail claim`  | Übernimmt die Unterhaltung in diesem Kanal | Supportteam, Moderationsteam |
| `/modmail unclaim`  | Gibt die Unterhaltung in diesem Kanal wieder frei | Supportteam, Moderationsteam |
| `/modmail add` `nutzer` | Fügt ein Teammitglied zur Unterhaltung hinzu | Supportteam, Moderationsteam |
| `/modmail remove` `nutzer` | Entfernt ein hinzugefügtes Teammitglied | Supportteam, Moderationsteam |
| `/modmail note` `text` | Fügt eine interne Notiz hinzu (nur für das Team sichtbar) | Supportteam, Moderationsteam |
| `/modmail user` `nutzer` | Zeigt Informationen zu einem Nutzer | Supportteam, Moderationsteam |
| `/modmail history` `nutzer` | Zeigt die Modmail-Historie eines Nutzers | Supportteam, Moderationsteam |
| `/modmail stats` `[zeitraum]` | Modmail-Statistiken | Supportteam, Moderationsteam |

### Bewerbungen

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/bewerbung panel`  | Sendet das Bewerbungs-Panel in diesen Kanal | Community-Management |
| `/bewerbung fragen` `bereich` | Bearbeitet die Fragen eines Bereichs (bis zu 10) | Community-Management |
| `/bewerbung einstellungen` `bereich` `[offen]` `[rolle]` `[abteilung]` `[rolle_entfernen]` | Rolle, Abteilung und Status eines Bereichs | Community-Management |
| `/bewerbung erstellen` `name` `[emoji]` | Erstellt einen neuen Bewerbungsbereich | Community-Management |
| `/bewerbung verlauf` `nutzer` | Bewerbungsverlauf einer Person | Supportteam, Moderationsteam, Abteilungsleitung |
| `/bewerbung status`  | Zeigt den Status deiner eigenen Bewerbungen | Alle |
| `/bewerbung statistik`  | Statistiken zu Bewerbungen | Supportteam, Moderationsteam, Abteilungsleitung |

### Moderation

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/ban` `nutzer` `[grund]` `[nachrichten_loeschen]` | Bannt eine Person vom Discord-Server | Administration |
| `/clear` `anzahl` `[nutzer]` | Löscht Nachrichten in diesem Kanal | Moderationsteam |
| `/kick` `nutzer` `[grund]` | Kickt eine Person vom Discord-Server | Moderationsteam |
| `/lock` `[kanal]` `[grund]` | Sperrt einen Kanal für Mitglieder | Moderationsteam |
| `/modlogs` `nutzer` `[seite]` | Zeigt die Strafhistorie einer Person | Moderationsteam |
| `/slowmode` `sekunden` `[kanal]` | Stellt den Slowmode eines Kanals ein | Moderationsteam |
| `/timeout` `nutzer` `dauer` `[grund]` | Versetzt eine Person in den Timeout | Moderationsteam |
| `/unlock` `[kanal]` `[grund]` | Entsperrt einen Kanal | Moderationsteam |
| `/untimeout` `nutzer` `[grund]` | Hebt einen Timeout auf | Moderationsteam |
| `/warn` `nutzer` `grund` | Verwarnt eine Person | Moderationsteam |
| `/warnings` `nutzer` `[entfernen]` `[grund]` | Zeigt oder entfernt Verwarnungen | Moderationsteam |

### Team (Staff)

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/staff info` `[nutzer]` | Informationen zu einem Teammitglied | Moderationsteam, Supportteam, Server-Management (ER:LC), Session-Host |
| `/staff stats` `[nutzer]` `[zeitraum]` | Aktivitätsstatistik eines Teammitglieds | Moderationsteam, Supportteam, Server-Management (ER:LC), Session-Host |
| `/staff duty` `aktion` | Dienst beginnen, beenden oder anzeigen | Moderationsteam, Supportteam, Server-Management (ER:LC), Session-Host |
| `/staff promote` `nutzer` `[grund]` | Befördert ein Teammitglied in den nächsten Teamrang | Community-Management |
| `/staff demote` `nutzer` `[grund]` | Stuft ein Teammitglied einen Teamrang herab | Community-Management |
| `/staff warn` `nutzer` `grund` | Erteilt einem Teammitglied eine Teamverwarnung | Community-Management |
| `/staff leaderboard` `[zeitraum]` | Rangliste der aktivsten Teammitglieder | Moderationsteam, Supportteam, Server-Management (ER:LC), Session-Host |
| `/staff raenge` `aktion` `[rolle]` `[position]` | Teamränge festlegen (Reihenfolge für Beförderungen) | Administration |

### Ankündigungen

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/announce allgemein` `[kanal]` `[titel]` `[rolle]` `[everyone]` `[bild]` `[farbe]` `[zeitpunkt]` | Allgemeine Ankündigung | Community-Management |
| `/announce session` `[kanal]` `[titel]` `[rolle]` `[everyone]` `[bild]` `[farbe]` `[zeitpunkt]` | Session-Ankündigung | Session-Host, Community-Management |
| `/announce department` `abteilung` `[kanal]` `[titel]` `[everyone]` `[bild]` `[farbe]` `[zeitpunkt]` | Ankündigung an eine Abteilung | Abteilungsleitung |
| `/announce emergency` `[kanal]` `[titel]` `[rolle]` `[everyone]` `[bild]` `[farbe]` `[zeitpunkt]` | Wichtige Mitteilung / Notfall | Community-Management |
| `/announce maintenance` `[kanal]` `[titel]` `[rolle]` `[everyone]` `[bild]` `[farbe]` `[zeitpunkt]` | Wartungsankündigung | Community-Management, Server-Management (ER:LC) |
| `/announce geplant`  | Zeigt geplante Ankündigungen | Community-Management, Session-Host, Abteilungsleitung |
| `/announce abbrechen` `id` | Bricht eine geplante Ankündigung ab | Community-Management, Session-Host, Abteilungsleitung |

### Community

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/giveaway start` `preis` `dauer` `[gewinner]` `[voraussetzung]` `[rolle]` | Startet ein Gewinnspiel in diesem Kanal | Community-Management, Moderationsteam |
| `/giveaway ende` `id` | Beendet ein Gewinnspiel sofort | Community-Management, Moderationsteam |
| `/giveaway reroll` `id` | Lost einen neuen Gewinner aus | Community-Management, Moderationsteam |
| `/giveaway liste`  | Zeigt laufende Gewinnspiele | Alle |
| `/infopanel erstellen`  | Erstellt ein Infopanel in diesem Kanal | Community-Management |
| `/infopanel bearbeiten` `panel` | Bearbeitet ein Infopanel | Community-Management |
| `/infopanel loeschen` `panel` | Löscht ein Infopanel | Community-Management |
| `/level rang` `[nutzer]` | Zeigt dein Level oder das einer anderen Person | Alle |
| `/level rangliste`  | Die aktivsten Mitglieder | Alle |
| `/level rolle` `level` `[rolle]` | Belohnungsrolle für ein Level festlegen oder entfernen | Community-Management |
| `/level rollen`  | Zeigt alle Level-Rollen | Alle |
| `/rollenpanel erstellen` `titel` `[beschreibung]` | Erstellt ein neues Rollen-Panel | Administration |
| `/rollenpanel hinzufuegen` `panel` `rolle` `beschriftung` `[emoji]` | Fügt eine Rolle hinzu | Administration |
| `/rollenpanel entfernen` `panel` `rolle` | Entfernt eine Rolle | Administration |
| `/rollenpanel senden` `panel` `[kanal]` | Sendet oder aktualisiert das Panel | Administration |
| `/rollenpanel loeschen` `panel` | Löscht ein Panel | Administration |
| `/serverstats anzeigen`  | Zeigt die Statistiken des Servers | Alle |
| `/serverstats kanaele`  | Erstellt automatische Statistik-Kanäle | Administration |
| `/serverstats entfernen`  | Entfernt die Statistik-Kanäle | Administration |
| `/textbaustein senden` `name` `[nutzer]` | Sendet einen Textbaustein | Moderationsteam, Supportteam, Session-Host, Abteilungsleitung |
| `/textbaustein erstellen` `name` | Erstellt oder bearbeitet einen Textbaustein | Community-Management |
| `/textbaustein loeschen` `name` | Löscht einen Textbaustein | Community-Management |
| `/textbaustein liste`  | Zeigt alle Textbausteine | Moderationsteam, Supportteam, Session-Host, Abteilungsleitung |
| `/umfrage` `frage` `optionen` `[dauer]` `[mehrfach]` `[rolle]` | Erstellt eine Umfrage | Community-Management, Moderationsteam, Abteilungsleitung, Session-Host |
| `/verifizierung panel`  | Sendet das Verifizierungs-Panel in diesen Kanal | Administration |
| `/verifizierung manuell` `nutzer` | Verifiziert eine Person manuell | Moderationsteam, Supportteam |
| `/verifizierung status` `nutzer` | Zeigt den Verifizierungsstatus einer Person | Moderationsteam, Supportteam |
| `/vorschlag erstellen` `vorschlag` | Reicht einen Vorschlag ein | Alle |
| `/vorschlag status` `id` `status` `[antwort]` | Ändert den Status eines Vorschlags (Team) | Community-Management, Moderationsteam |

### Konfiguration

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/config anzeigen`  | Zeigt die aktuelle Konfiguration | Administration |
| `/config berechtigung` `gruppe` `rolle` `aktion` | Ordnet einer Berechtigungsgruppe eine Rolle zu oder entfernt sie | Administration |
| `/config befehl` `befehl` `modus` | Legt fest, wer einen Befehl nutzen darf (Befehls-Ausnahmen) | Administration |
| `/config befehle`  | Zeigt alle Befehle mit ihren Berechtigungen | Administration |
| `/config erlc` `[intervall]` `[code_oeffentlich]` `[beitrittslink]` | ER:LC-Einstellungen | Administration |
| `/config session` `[mindestspieler]` `[voll_ab]` | Session-Einstellungen | Administration |
| `/config vorlage` `vorlage` | Bearbeitet eine deutsche Textvorlage | Administration |
| `/config allgemein` `[name]` `[logo]` | Name und Logo des Bots in Embeds | Administration |
| `/config verifizierung` `[mindestalter]` `[captcha]` | Einstellungen der Verifizierung | Administration |
| `/config moderation` `[grund_pflicht]` `[dm]` | Einstellungen der Moderation | Administration |
| `/config bewerbungen` `[wartezeit]` | Einstellungen der Bewerbungen | Administration |
| `/config community` `[willkommen]` `[abschied]` `[level]` `[level_meldung]` | Willkommen, Abschied und Level-System | Administration |
| `/resetconfig` `bereich` | Setzt die Konfiguration zurück (Daten wie Sessions bleiben erhalten) | Administration |
| `/setchannel` `art` `[kanal]` | Legt einen Kanal für eine Funktion fest | Administration |
| `/setcolor` `art` `farbe` | Ändert die Embed-Farben des Bots | Administration |
| `/setlogchannel` `art` `[kanal]` | Legt einen Log-Kanal fest | Administration |
| `/setrole` `art` `[rolle]` | Legt eine Rolle für eine Funktion fest | Administration |
| `/setup`  | Interaktive Einrichtung des Bots | Administration |

### Allgemein

| Befehl | Beschreibung | Berechtigt (Standard) |
|---|---|---|
| `/hilfe`  | Zeigt alle Befehle und was du nutzen darfst | Alle |
