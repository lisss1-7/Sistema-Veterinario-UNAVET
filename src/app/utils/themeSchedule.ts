export type UnavetTheme = 'light' | 'dark';

const MANUAL_OVERRIDE_KEY = 'unavet_theme_manual_override';

type ThemeOverride = {
  theme: UnavetTheme;
  expiresAt: number;
};

export function getScheduledTheme(date = new Date()): UnavetTheme {
  const hour = date.getHours();
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
}

export function getNextThemeChange(date = new Date()): Date {
  const nextChange = new Date(date);
  const hour = date.getHours();

  if (hour < 6) {
    nextChange.setHours(6, 0, 0, 0);
  } else if (hour < 18) {
    nextChange.setHours(18, 0, 0, 0);
  } else {
    nextChange.setDate(nextChange.getDate() + 1);
    nextChange.setHours(6, 0, 0, 0);
  }

  return nextChange;
}

export function getManualThemeOverride(now = Date.now()): ThemeOverride | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(MANUAL_OVERRIDE_KEY);
    if (!stored) return null;

    const override = JSON.parse(stored) as Partial<ThemeOverride>;
    const validTheme = override.theme === 'light' || override.theme === 'dark';
    const validExpiration =
      typeof override.expiresAt === 'number' && override.expiresAt > now;

    if (validTheme && validExpiration) {
      return override as ThemeOverride;
    }

    localStorage.removeItem(MANUAL_OVERRIDE_KEY);
  } catch {
    localStorage.removeItem(MANUAL_OVERRIDE_KEY);
  }

  return null;
}

export function saveManualThemeOverride(theme: UnavetTheme): void {
  if (typeof window === 'undefined') return;

  const override: ThemeOverride = {
    theme,
    expiresAt: getNextThemeChange().getTime(),
  };

  localStorage.setItem(MANUAL_OVERRIDE_KEY, JSON.stringify(override));
}
