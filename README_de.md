# ioBroker.bluelink

Adapter zur Steuerung von Hyundai- und Kia-Fahrzeugen in ioBroker.

## Changelog
### **WORK IN PROGRESS**
* (ipod86) Login-Fix für EU Hyundai/Kia: IDPConnect blockiert seit ca. 11.08.2026 den Passwort-Login mit der alten client_id als "abusing request", wodurch die automatische Token-Erneuerung komplett ausfiel. Nutzt stattdessen den OneApp/CCI-Login (nicht betroffen), umgeht bluelinkys eigenen Token-Refresh für CCI-Tokens (architektonisch inkompatibel, siehe lib/tokenManager.js) und ergänzt die dabei übersprungene Geräte-ID-Registrierung.
* (meistermopper) Fehler in der Standort-Extraktion für Kia und Hyundai CCS2-Fahrzeuge behoben und dedizierte Standort-Schnittstelle priorisiert.
* (meistermopper) Button control.force_location hinzugefügt und Live-Telematik POST-Abfragen für Echtzeit-GPS-Updates direkt vom Fahrzeug implementiert.
* (meistermopper) TypeScript-Typisierungen und Property-Zugriffe beim Status-Parsing korrigiert.
