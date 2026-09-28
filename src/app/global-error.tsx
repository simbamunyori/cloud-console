"use client";

import { SectionError } from "@/components/ui/section-error";
import "./globals.css";

/** The last resort, when even the page frame fails. It brings its own <html>. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 py-12">
          <SectionError title="Something went wrong" reset={reset} />
        </main>
      </body>
    </html>
  );
}
