# Fourth Generation Technologies: Brand Guidelines

Version 1.1, September 2026. Built from FGT Brand Guidelines v1.0, with production files and UI tokens added for the Cloud Console.

## Instruction for Claude Code

Unzip this pack into a `brand` folder at the repo root and follow this file exactly. Use the files as they are. Do not redraw the logo, recolour it, or set the wordmark in live text; the wordmark in every SVG is already outlined.

## Logo

The mark is a geometric numeral 4 cut from three planes on a navy tile with rounded corners. The wordmark sets "Fourth Generation" in Poppins Bold and "TECHNOLOGIES" in Poppins Light with wide letter spacing.

| File | Use |
| --- | --- |
| `logo/fgt-logo.svg` | Primary lockup on white and light backgrounds |
| `logo/fgt-logo-reverse.svg` | Reverse lockup on navy and dark backgrounds |
| `logo/fgt-mark.svg` | Standalone mark: favicons, app icons, avatars, small spaces |
| `logo/fgt-mark-light.svg` | Mark on navy or dark backgrounds, where the navy tile would disappear |
| `png/` | PNG versions of all of the above at several widths |
| `icons/web/` | favicon.ico, favicon.svg, apple-touch-icon, 192 and 512 icons, maskable 512 icon |
| `icons/ios/AppIcon-1024.png` | App Store icon, opaque, no rounded corners (iOS rounds them) |
| `icons/android/` | Adaptive icon foreground (the 4 on transparent, inside the safe zone) and a 512 icon. Adaptive background colour: #0B1F3A |

Rules:

- Keep clear space around the logo equal to the height of the numeral 4.
- Minimum width of the full lockup: 40 mm in print, 160 px on screen. Below that, use the mark alone.
- Do not stretch, rotate, recolour, add effects or place the lockup on busy imagery.
- In the console header, use the lockup on desktop and the mark alone on phone widths.

## Colour

Brand palette:

| Name | Hex | Role |
| --- | --- | --- |
| Navy | #0B1F3A | Primary. Carries the brand. Text on light, background in dark mode |
| Electric Blue | #2F6BFF | Accent. Primary buttons, links, focus, emphasis |
| Teal | #00D4C2 | Accent. Icons, rules, highlights on dark, the gradient |
| Slate | #7A8699 | Secondary text in print and large type only |
| Mist | #F4F7FB | Light surfaces |
| Ink on dark | #C9D3E3 | Body text on navy; headings on navy are white |

Gradient: Electric Blue to Teal, left to right or top-left to bottom-right. Never use the gradient on body text, and use it sparingly in the UI: the logo, one hero moment, progress. Not as decoration on cards.

Accessibility rules for screens (checked against WCAG AA, 4.5:1 for normal text):

- Teal on white is 1.9:1. Never use teal for text, thin icons or button labels on light backgrounds. It works on navy (8.8:1).
- Slate on white is 3.7:1. For small secondary text on screens use Text Muted #5E6B80 (5.4:1) instead.
- Electric Blue on white is exactly 4.5:1: fine for buttons with white labels. For link text use #1F5AE6 (5.7:1). On navy, use #5B8CFF for blue text (5.2:1).

UI tokens are in `tokens/tokens.json` and `tokens/tokens.css` (light and dark themes). Status colours (success, warning, danger) were added for the console and pass AA on their backgrounds; they are not brand colours and should only signal status.

## Typography

Poppins, free under the SIL Open Font License (files and licence in `fonts/`). In Next.js, load it with `next/font/google` (weights 300, 400, 500, 600, 700) rather than serving the files.

- Headlines: Poppins Bold, letter spacing -0.02em
- Subheads: Poppins SemiBold
- Body: Poppins Regular (Light only at 18 px and above on screens), 16 px on screen, 11 to 12 pt in print
- Labels and kickers: Poppins Medium, uppercase, letter spacing 0.3em. In the console, use these sparingly, for section labels that carry meaning, not above every heading.

Fallback: Arial or Helvetica.

## Voice

Direct, confident and plain. Short sentences. No jargon for its own sake. We describe what we do and what the client gets. No exclamation marks, no hype words, no em dashes.

Tagline: Next-generation hosting, software and security.
