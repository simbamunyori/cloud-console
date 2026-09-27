import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireMember } from "@/server/org/context";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const { organisation, actor } = await requireMember();
  return <PageHeader eyebrow={organisation.name} title={`Welcome, ${actor.name.split(" ")[0]}`} />;
}
