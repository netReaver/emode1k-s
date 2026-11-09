import { byId } from './dom.js';

const DEFAULTS = {
  accent_color: '#e5484d',
  theme: 'standard',
  page_scale: 100,
  brightness: 100,
  animations_enabled: true,
};

export function applySettings(settings = {}) {
  const merged = { ...DEFAULTS, ...settings };
  const root = document.documentElement;

  root.style.setProperty('--accent', merged.accent_color);
  root.style.setProperty('--brightness', String(Number(merged.brightness) / 100));
  root.style.setProperty('--page-scale', String(Number(merged.page_scale) / 100));

  document.body.classList.toggle('theme-gothic', merged.theme === 'gothic');
  document.body.classList.toggle('animations-off', merged.animations_enabled === false);
}

export function settingsIntoForm(settings) {
  const merged = { ...DEFAULTS, ...settings };

  byId('colorSelect').value = merged.accent_color;
  byId('themeSelect').value = merged.theme === 'gothic' ? 'gothic' : 'standard';
  byId('pageScale').value = merged.page_scale;
  byId('pageScaleOutput').value = `${merged.page_scale}%`;
  byId('brightness').value = merged.brightness;
  byId('brightnessOutput').value = `${merged.brightness}%`;
  byId('animationsEnabled').checked = merged.animations_enabled !== false;
}

export function settingsFromForm() {
  return {
    accent_color: byId('colorSelect').value,
    theme: byId('themeSelect').value,
    page_scale: Number(byId('pageScale').value),
    brightness: Number(byId('brightness').value),
    animations_enabled: byId('animationsEnabled').checked,
  };
}
