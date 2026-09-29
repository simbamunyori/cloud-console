"use client";

import { RefreshRouteOnSave } from "@payloadcms/live-preview-react";
import { useRouter } from "next/navigation";

/** In the website editor's preview: redraws the page each time the editor saves. */
export function LivePreview() {
  const router = useRouter();
  return <RefreshRouteOnSave refresh={() => router.refresh()} serverURL={typeof window === "undefined" ? "" : window.location.origin} />;
}
