import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            ...["mega", "hero", "display-lg", "display", "title-1", "title-2", "headline", "body", "callout", "caption"],
            // The public site's own sizes (tokens.json font.scale "site-…").
            ...["site-hero", "site-hero-sm", "site-closing", "site-closing-sm", "site-h2", "site-h2-sm", "site-lead", "site-kicker", "site-stat", "site-nav", "site-strip"],
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
