// Общие помощники всплывающих окон Juk Browser (suggestions, password-prompt, downloads-bubble, menu).
/* exported popupEsc, popupApplyTheme, popupT, popupRepop */
const popupEsc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Применяет палитру темы, присланную из main (themeVars), к CSS-переменным окна.
function popupApplyTheme(p) {
  const r = document.documentElement.style;
  if (p && p.theme) for (const [k, v] of Object.entries({ bg: '--bg', text: '--text', muted: '--muted', hover: '--hover', accent: '--accent', accentFg: '--accent-fg', onAccent: '--on-accent', accentSoft: '--accent-soft', border: '--border' })) r.setProperty(v, p.theme[k]);
}

// Возвращает функцию перевода по языку из состояния окна.
function popupT(p) {
  const T = (typeof LANGS !== 'undefined' && LANGS[p && p.lang]) || (typeof LANGS !== 'undefined' && LANGS.ru) || {};
  return k => T[k] || k;
}

// Перезапускает CSS-анимацию появления карточки при новом состоянии.
function popupRepop(el) {
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}
