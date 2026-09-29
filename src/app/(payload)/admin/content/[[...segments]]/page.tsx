import config from "@payload-config";
import { generatePageMetadata, RootPage } from "@payloadcms/next/views";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentSession, staffHomeFor } from "@/server/auth/next";
import { websiteRoleOf } from "@/server/staff/access";
import { importMap } from "../importMap";

type Args = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
};

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> => generatePageMetadata({ config, params, searchParams });

/**
 * Staff sign in on the staff console's own pages, then come here. Anyone
 * without a website role is sent to a page that says who can give one.
 */
export default async function Page({ params, searchParams }: Args) {
  const session = await currentSession("STAFF");
  if (session?.stage !== "ACTIVE") redirect(staffHomeFor(session));
  if (!websiteRoleOf(session.user)) redirect("/admin/website-access");
  return RootPage({ config, params, searchParams, importMap });
}
