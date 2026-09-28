import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { headers } from "next/headers";
import tokens from "@/config/theme/tokens.json";
import { company } from "@/config/app";
import { env } from "@/server/env";
import { themeAttribute } from "@/lib/theme";
import { currentTheme } from "@/server/theme";
import "./globals.css";

// brand/BRAND.md: Poppins through next/font/google, weights 300 to 700.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const name = env().CONSOLE_NAME;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: `${company.name}. ${company.tagline}`,
    applicationName: name,
    icons: {
      icon: [
        { url: "/brand/icons/favicon.svg", type: "image/svg+xml" },
        { url: "/brand/icons/favicon.ico", sizes: "any" },
      ],
      apple: "/brand/icons/apple-touch-icon.png",
    },
  };
}

/** The browser bar matches the page: the chosen theme, or the device's. */
export async function generateViewport(): Promise<Viewport> {
  const theme = themeAttribute(await currentTheme());
  if (theme) return { themeColor: tokens.console[theme].page };
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: tokens.console.light.page },
      { media: "(prefers-color-scheme: dark)", color: tokens.console.dark.page },
    ],
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading the request makes every page render per request, which the
  // content security policy needs: Next.js stamps its scripts with the
  // nonce from src/middleware.ts.
  await headers();
  const theme = themeAttribute(await currentTheme());
  return (
    <html lang="en" className={poppins.variable} data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
