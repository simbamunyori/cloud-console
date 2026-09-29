import type { Metadata } from "next";
import { themeAttribute } from "@/lib/theme";
import { currentTheme } from "@/server/theme";
import NotFound from "./(frontend)/not-found";
import { poppins } from "./fonts";
import "./globals.css";

export const metadata: Metadata = { title: "Page not found" };

/**
 * An address no route matches. The site and the website editor have their
 * own root layouts, so this page brings its own <html>, as global-error does.
 */
export default async function GlobalNotFound() {
  const theme = themeAttribute(await currentTheme());
  return (
    <html lang="en" className={poppins.variable} data-theme={theme}>
      <body>
        <NotFound />
      </body>
    </html>
  );
}
