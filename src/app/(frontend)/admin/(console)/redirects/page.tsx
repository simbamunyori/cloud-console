import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireWebsiteStaff } from "@/server/admin/context";
import { listRedirects } from "@/server/admin/redirects";
import { prisma } from "@/server/db";
import { OLD_SITE_PREFIX } from "@/server/site/redirects";
import { canPublishWebsite } from "@/server/staff/access";
import { RedirectForm, RemoveForm } from "./forms";

export const metadata: Metadata = { title: "Old site addresses" };

/** Where links to the old website land now (Milestone 10). */
export default async function RedirectsPage() {
  const { actor } = await requireWebsiteStaff();
  const rows = await listRedirects(prisma);
  const canChange = canPublishWebsite(actor.websiteRole);
  return (
    <>
      <PageHeader
        title="Old site addresses"
        description={`Links to the old website, from search results, emails and bookmarks, and the pages they open now. Anything else under ${OLD_SITE_PREFIX}/ opens the home page.`}
      />
      <div className="flex flex-col gap-6">
        {canChange ? (
          <Card aria-labelledby="add-title">
            <CardHeader id="add-title" title="Send an old address to a page" description="Saving an address that is already listed changes where it goes. Changes apply within a minute." />
            <CardBody>
              <RedirectForm />
            </CardBody>
          </Card>
        ) : null}
        <Card aria-labelledby="list-title">
          <CardHeader id="list-title" title={`Addresses (${rows.length})`} description="Visits counts how often each was followed since launch, so you can see which old links still matter." />
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-callout">
                <caption className="sr-only">Old site addresses</caption>
                <thead className="text-ink-muted">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-semibold">Old address</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Goes to</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Visits</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Last visit</th>
                    {canChange ? <th scope="col" className="px-6 py-3 font-semibold"><span className="sr-only">Remove</span></th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="break-all px-6 py-3 text-ink">{r.fromPath}</td>
                      <td className="break-all px-6 py-3 text-ink-body">{r.toPath}</td>
                      <td className="px-6 py-3 text-ink-body">{r.hits}</td>
                      <td className="px-6 py-3 text-ink-body">{r.lastHitAt ? formatMoment(r.lastHitAt, DEFAULT_TIME_ZONE) : "Not yet"}</td>
                      {canChange ? (
                        <td className="px-6 py-3">
                          <RemoveForm id={r.id} fromPath={r.fromPath} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CardBody>
              <p className="text-ink-body">None listed. Old addresses under {OLD_SITE_PREFIX}/ still open the home page.</p>
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}
