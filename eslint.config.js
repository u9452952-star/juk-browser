// ESLint flat config для Juk Browser.
// Окружения: main/preload/конфиг — Node.js (CommonJS), renderer/i18n — браузерные скрипты.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**']
  },
  js.configs.recommended,
  {
    rules: {
      // Пустые catch-блоки используются осознанно (best-effort операции)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // \x00-\x1F в safeFilename — намеренная фильтрация управляющих символов
      'no-control-regex': 'off'
    }
  },
  {
    files: ['main.js', 'preload*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node }
    }
  },
  {
    files: ['renderer.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        browser: 'readonly', // мост из preload.js
        LANGS: 'readonly'    // словарь из i18n.js
      }
    }
  },
  {
    files: ['i18n.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        module: 'writable' // i18n.js работает и в Node (module.exports)
      }
    }
  }
];
