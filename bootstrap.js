// Точка входа. Убирает признаки Electron из User-Agent и Client Hints:
// Google и ряд других сайтов блокируют вход (accounts.google.com) во «встроенных» браузерах по токенам Electron/<имя приложения>.
const { app } = require('electron');

app.userAgentFallback = app.userAgentFallback.replace(/\s(?:Electron|Juk\s?Browser|juk-browser)\/[\d.]+/gi, '').trim();

app.on('session-created', (ses) => {
  try { ses.setUserAgent(app.userAgentFallback); } catch {}
  try {
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const h = details.requestHeaders;
      for (const k of Object.keys(h)) {
        if (/^sec-ch-ua(?:-full-version-list)?$/i.test(k)) {
          h[k] = String(h[k]).replace(/,?\s*"Electron";v="[^"]*"/gi, '').replace(/^\s*,\s*/, '');
        }
      }
      callback({ requestHeaders: h });
    });
  } catch {}
});

require('./main.js');
