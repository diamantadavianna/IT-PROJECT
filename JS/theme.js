const THEME_KEY = "ic-theme-settings";
const THEME_DEFAULTS = { mode: "auto", lightStart: 6, darkStart: 18 };

function loadThemeSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_KEY));
    return { ...THEME_DEFAULTS, ...saved };
  } catch {
    return { ...THEME_DEFAULTS };
  }
}

function saveThemeSettings(settings) {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(settings));
  } catch {
    /* localStorage tidak tersedia, abaikan */
  }
}

function isDarkByTime({ lightStart, darkStart }) {
  const hour = new Date().getHours();
  if (lightStart === darkStart) return false;
  if (lightStart < darkStart) {
    // contoh: terang 6 -> 18, gelap sisanya
    return hour < lightStart || hour >= darkStart;
  }
  // contoh: terang 20 -> 4 (melewati tengah malam)
  return hour >= darkStart && hour < lightStart;
}

function applyTheme() {
  const settings = loadThemeSettings();
  let isDark;
  if (settings.mode === "dark") isDark = true;
  else if (settings.mode === "light") isDark = false;
  else isDark = isDarkByTime(settings);

  document.documentElement.setAttribute(
    "data-theme",
    isDark ? "dark" : "light",
  );
}

// Dipakai halaman Pengaturan
window.ThemeSettings = {
  get: loadThemeSettings,
  set(partial) {
    saveThemeSettings({ ...loadThemeSettings(), ...partial });
    applyTheme();
  },
  reset() {
    saveThemeSettings({ ...THEME_DEFAULTS });
    applyTheme();
  },
};

applyTheme();
setInterval(applyTheme, 60 * 1000); // di mode "auto", cek ulang tiap menit
