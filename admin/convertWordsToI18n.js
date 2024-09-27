const fs = require('fs');
const path = require('path');

// 1. Importiere die words.js Datei
const { words } = require('./words.js');

// 2. Definiere die Zielsprachen und Dateien
const languages = ['en', 'de']; // Sprachen, die du unterstützen möchtest
const translations = {
  en: {},
  de: {}
};

// 3. Automatisch Übersetzungen für die Sprachen anlegen (hier nur als Beispiel)
Object.keys(words).forEach(key => {
  translations.en[key] = words[key]; // Englisch bleibt gleich
  translations.de[key] = words[key]; // In einer echten App würdest du hier echte Übersetzungen hinzufügen
});

// 4. Erstelle das Verzeichnis für die Lokalisierungen
const localesDir = path.join(__dirname, 'locales');
if (!fs.existsSync(localesDir)) {
  fs.mkdirSync(localesDir);
}

// 5. Schreibe die JSON-Dateien für jede Sprache
languages.forEach(lang => {
  const filePath = path.join(localesDir, `${lang}.json`);
  fs.writeFileSync(filePath, JSON.stringify(translations[lang], null, 2), 'utf8');
  console.log(`Übersetzungen für ${lang} gespeichert in ${filePath}`);
});

console.log("Konvertierung abgeschlossen.");

