// Turns tokens.json into CSS custom properties for Tailwind. Nothing here
// holds a value of its own: change the brand in tokens.json.
import plugin from "tailwindcss/plugin";
import tokens from "./tokens.json" with { type: "json" };

function kebab(s) {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Semantic colours for one scheme, plus soft tints mixed from them. */
function scheme(base, extra) {
  const vars = {};
  for (const [k, v] of Object.entries(base)) vars[`--${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(extra)) vars[`--${kebab(k)}`] = v;
  const mix = tokens.console.softMix;
  for (const tone of ["primary", "success", "warning", "danger", "accent"]) {
    vars[`--${tone}-soft`] = `color-mix(in srgb, var(--${tone}) ${mix}, var(--card))`;
  }
  return vars;
}

const light = scheme(tokens.light, tokens.console.light);
const dark = scheme(tokens.dark, tokens.console.dark);

const shared = {
  "--brand-navy": tokens.brand.navy,
  "--brand-blue": tokens.brand.electricBlue,
  "--brand-teal": tokens.brand.teal,
  "--brand-ink-on-dark": tokens.brand.inkOnDark,
  "--brand-white": tokens.brand.white,
  "--brand-gradient": tokens.brand.gradient,
  "--font-family": tokens.font.family,
  "--font-family-mono": tokens.font.mono,
  "--tracking-headline": tokens.font.headlineTracking,
  "--tracking-label": tokens.font.labelTracking,
  "--radius-token-sm": tokens.radius.sm,
  "--radius-token-md": tokens.radius.md,
  "--radius-token-lg": tokens.radius.lg,
  "--space-unit": tokens.space["1"],
};
for (const [k, v] of Object.entries(tokens.layout)) shared[`--layout-${kebab(k)}`] = v;
for (const [k, v] of Object.entries(tokens.motion)) shared[`--motion-${k}`] = v;
for (const [k, v] of Object.entries(tokens.space)) shared[`--space-${k}`] = v;
for (const [name, t] of Object.entries(tokens.font.scale)) {
  shared[`--type-${name}-size`] = t.size;
  shared[`--type-${name}-line`] = t.lineHeight;
  shared[`--type-${name}-weight`] = String(t.weight);
  shared[`--type-${name}-tracking`] = t.tracking;
}

export default plugin(({ addBase }) => {
  addBase({
    ":root": { ...shared, ...light, "color-scheme": "light" },
    ":root[data-theme='dark']": { ...dark, "color-scheme": "dark" },
    "@media (prefers-color-scheme: dark)": {
      ":root:not([data-theme='light'])": { ...dark, "color-scheme": "dark" },
    },
  });
});
