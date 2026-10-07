/**
 * The colour theme a person picked. With no choice yet, the navy (dark)
 * theme is the default (docs/STRATEGY_ROLLOUT.md, U2); "system" follows
 * the device for those who pick it.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "theme";
export const DEFAULT_THEME: Theme = "dark";

export function parseTheme(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

/** The data-theme attribute for <html>. None for "system", so the CSS follows prefers-color-scheme. */
export function themeAttribute(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
