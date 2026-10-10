function applyThemeByTime() {
  const hour = new Date().getHours();
  const isDark = hour >= 18 || hour < 6;
  document.documentElement.setAttribute(
    "data-theme",
    isDark ? "dark" : "light",
  );
}
applyThemeByTime();
setInterval(applyThemeByTime, 60 * 1000);
