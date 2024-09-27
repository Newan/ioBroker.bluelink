const fs = require('fs');
const path = require('path');

// Beispielhaftes systemDictionary
const systemDictionary = {
  'bluelink adapter settings': {
    'en': 'Adapter settings for bluelink',
    'de': 'Adaptereinstellungen für bluelink',
    'ru': 'Настройки адаптера для bluelink',
    'pt': 'Configurações do adaptador para bluelink',
    'nl': 'Adapterinstellingen voor bluelink',
    'fr': "Paramètres d'adaptateur pour bluelink",
    'it': "Impostazioni dell'adattatore per bluelink",
    'es': 'Ajustes del adaptador para bluelink',
    'pl': 'Ustawienia adaptera dla bluelink',
    'zh-cn': 'bluelink的适配器设置'
  }
};


// Funktion zur Konvertierung von systemDictionary in eine Ordnerstruktur mit translations.json
function convertToI18n(systemDictionary) {
  const translations = {};

  // Iteriere durch alle Schlüssel im systemDictionary
  for (const [key, values] of Object.entries(systemDictionary)) {
    // Iteriere durch alle Sprachen für jeden Schlüssel
    for (const [lang, translation] of Object.entries(values)) {
      if (!translations[lang]) {
        translations[lang] = {};
      }
      translations[lang][key] = translation;
    }
  }

  // Speicher die Übersetzungen in separaten Ordnern mit translations.json
  const localesDir = path.join(__dirname, 'i18n');
  if (!fs.existsSync(localesDir)) {
    fs.mkdirSync(localesDir);
  }

  // Erstelle einen Ordner pro Sprache und speichere translations.json darin
  for (const [lang, translation] of Object.entries(translations)) {
    const langDir = path.join(localesDir, lang); // Ordner für die Sprache
    if (!fs.existsSync(langDir)) {
      fs.mkdirSync(langDir);
    }

    const filePath = path.join(langDir, 'translations.json');
    fs.writeFileSync(filePath, JSON.stringify(translation, null, 2), 'utf8');
    console.log(`Übersetzungen für ${lang} gespeichert in ${filePath}`);
  }
}

convertToI18n(systemDictionary);
