"use client";

import { SectionError } from "@/components/ui/section-error";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <SectionError title="The catalogue did not load" reset={reset} />;
}
