# ioBroker.bluelink

Adapter zur Steuerung von Hyundai- und Kia-Fahrzeugen in ioBroker.

## Datenquelle: Bluelink-App oder Pleos (EU Data Act)

Seit Oktober 2026 ist der Login der Bluelink-/Kia-Connect-App per Captcha geschützt, automatische Logins scheitern (`Signin returned HTTP 403`, `code 9035`). Als Alternative kann der Adapter die Fahrzeugdaten über die offizielle **Pleos Vehicle Data API** lesen (EU Data Act, nur Europa, Hyundai / Kia / Genesis).

* In den Adapter-Einstellungen, Tab **Allgemein**, die *Datenquelle* auf *Pleos Vehicle Data API* stellen.
* Einmalig einen Key holen: auf [Pleos Playground](https://pleos.ai/playground) registrieren, im Konto-Menü *My Vehicle Data API* öffnen, Marke wählen, Bedingungen akzeptieren, *Get API Key* klicken und mit dem Bluelink-/Kia-Connect-Konto anmelden ([Anleitung](https://document.pleos.ai/en/api-reference/vehicle-data-api/getting-started/for-private-users/request-my-vehicle-api-key)).
* Client ID und Client Secret im Tab **Pleos** eintragen. Die Marke im Tab Allgemein muss zum Key passen.

Die Pleos-Daten landen in denselben Datenpunkten wie im Bluelink-Modus (SoC, Laden, Stecker, Reichweite, km-Stand, Position, Türen, Verriegelung, Kofferraum, Haube, Klima, Warnungen). Der Reifendruck wird in beiden Modi nach bar in `vehicleStatus.tirePressure.*` umgerechnet (Rohwert: psi direkt, kPa ×5, bar ÷10; 255 = kein Messwert, z. B. wenn das Auto schläft – der letzte gültige Wert bleibt erhalten); alle Rohwerte unter `<vin>.pleosRaw`.

**Die Pleos-API ist nur lesend:** kein Ver-/Entriegeln, keine Klima-, Lade- oder Ladelimit-Befehle, keine Live-Abfrage direkt vom Auto, kein Fahrtenbuch. `control.force_refresh` liest den aktuellen Serverstand.

## Changelog
### **WORK IN PROGRESS**
* (ipod86) Neue Datenquelle Pleos Vehicle Data API (EU Data Act, nur lesen) als Alternative zum per Captcha blockierten App-Login
* (ipod86) Login-Fix für EU Hyundai/Kia: IDPConnect blockiert seit ca. 11.08.2026 den Passwort-Login mit der alten client_id als "abusing request", wodurch die automatische Token-Erneuerung komplett ausfiel. Nutzt stattdessen den OneApp/CCI-Login (nicht betroffen), umgeht bluelinkys eigenen Token-Refresh für CCI-Tokens (architektonisch inkompatibel, siehe lib/tokenManager.js) und ergänzt die dabei übersprungene Geräte-ID-Registrierung.
* (meistermopper) Fehler in der Standort-Extraktion für Kia und Hyundai CCS2-Fahrzeuge behoben und dedizierte Standort-Schnittstelle priorisiert.
* (meistermopper) Button control.force_location hinzugefügt und Live-Telematik POST-Abfragen für Echtzeit-GPS-Updates direkt vom Fahrzeug implementiert.
* (meistermopper) TypeScript-Typisierungen und Property-Zugriffe beim Status-Parsing korrigiert.
