import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { STAFF_ROLE_LABEL } from "@/server/staff/access";
import { duration, measureMonth, MIN_PUBLISH, PRIORITIES, PRIORITY_LABEL, previousMonthOf, QUEUES, queueRoutes, UNIT_KEYS, UNITS, unitTargets, type ResponseData } from "@/server/units/units";
import { MemberUnitsForm, QueueRouteForm, TargetsForm } from "./forms";

export const metadata: Metadata = { title: "Units" };

const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function Measures({ data, title }: { data: ResponseData; title: string }) {
  const total = data.measures.reduce((n, m) => n + m.tickets, 0);
  return (
    <Card aria-labelledby={`measures-${data.month}`}>
      <CardHeader
        id={`measures-${data.month}`}
        title={title}
        description={`${total} ${total === 1 ? "ticket" : "tickets"} opened${data.ratings ? `, ${data.ratings} rated, average ${data.satisfaction} out of 5` : ", none rated yet"}. Medians, and the share within each unit's target.`}
      />
      {data.measures.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-callout">
            <thead className="border-b border-border text-ink-muted">
              <tr>
                <th scope="col" className="px-5 py-2 font-semibold sm:px-6">Unit</th>
                <th scope="col" className="px-3 py-2 font-semibold">Priority</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Tickets</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">First reply</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Within target</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Sorted</th>
                <th scope="col" className="px-5 py-2 text-right font-semibold sm:px-6">Within target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {data.measures.map((m) => (
                <tr key={`${m.unit}-${m.priority}`}>
                  <td className="px-5 py-2 text-ink sm:px-6">{UNITS[m.unit].label}</td>
                  <td className="px-3 py-2 text-ink">{PRIORITY_LABEL[m.priority]}</td>
                  <td className="px-3 py-2 text-right text-ink">{m.tickets}</td>
                  <td className="px-3 py-2 text-right text-ink">{m.firstResponse === null ? "–" : duration(m.firstResponse)}</td>
                  <td className="px-3 py-2 text-right text-ink">{m.firstWithin === null ? "–" : `${m.firstWithin}%`}</td>
                  <td className="px-3 py-2 text-right text-ink">{m.resolve === null ? "–" : duration(m.resolve)}</td>
                  <td className="px-5 py-2 text-right text-ink sm:px-6">{m.resolveWithin === null ? "–" : `${m.resolveWithin}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <CardBody>
          <p className="text-ink-muted">No tickets opened.</p>
        </CardBody>
      )}
    </Card>
  );
}

export default async function UnitsPage() {
  await requireStaffCan("manageStaff");
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const [people, routes, targets, current, previous, reports, published] = await Promise.all([
    prisma.user.findMany({ where: { kind: "STAFF", staffRole: { not: null }, deactivatedAt: null }, select: { id: true, name: true, email: true, staffRole: true, units: true }, orderBy: { name: "asc" } }),
    queueRoutes(prisma),
    unitTargets(prisma),
    measureMonth(prisma, thisMonth),
    measureMonth(prisma, previousMonthOf(now)),
    prisma.responseReport.findMany({ orderBy: { month: "desc" }, take: 12 }),
    featureOn(prisma, "service-standards"),
  ]);
  const units = UNIT_KEYS.map((u) => ({ value: u, label: UNITS[u].label }));

  return (
    <>
      <PageHeader
        title="Units"
        description="Who works in which part of the business, which unit works each queue, and the response targets each unit is measured against. Each colleague sees their units' queues under My work."
      />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="members-title">
          <CardHeader id="members-title" title="People and their units" description="A colleague can be in more than one unit. Their staff role still decides what they can change." />
          <ul className="divide-y divide-border">
            {people.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{p.name}</span>
                  <span className="text-callout text-ink-muted">{p.email}</span>
                  {p.staffRole ? <Badge tone="info">{STAFF_ROLE_LABEL[p.staffRole]}</Badge> : null}
                  {p.units.length ? null : <Badge tone="warning">No unit</Badge>}
                </span>
                <MemberUnitsForm userId={p.id} name={p.name} current={p.units} units={units} />
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="queues-title">
          <CardHeader id="queues-title" title="Queues" description="Each queue goes to one unit. Its members see it, with what's waiting, under My work." />
          <ul className="divide-y divide-border">
            {QUEUES.map((q) => (
              <li key={q.key} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:px-6">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-ink">{q.label}</span>
                  {routes[q.key] !== q.unit ? <span className="text-caption text-ink-muted">Usually {UNITS[q.unit].label}</span> : null}
                </span>
                <QueueRouteForm queue={q.key} label={q.label} current={routes[q.key]} units={units} />
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="targets-title">
          <CardHeader
            id="targets-title"
            title="Response targets"
            description="Minutes from when a ticket is opened to our first reply the customer sees, and to when it's sorted. Measured on every ticket by the unit and priority set on it. 60 minutes is an hour; 480 is a working day; 1440 is a full day."
          />
          <CardBody className="flex flex-col gap-8">
            {UNIT_KEYS.map((u) => (
              <section key={u} aria-labelledby={`target-${u}`} className="flex flex-col gap-3">
                <h3 id={`target-${u}`} className="text-headline text-ink">
                  {UNITS[u].label}
                </h3>
                <TargetsForm unit={u} rows={PRIORITIES.map((p) => ({ priority: p, label: PRIORITY_LABEL[p], first: targets[u][p].firstResponse, resolve: targets[u][p].resolve }))} />
              </section>
            ))}
          </CardBody>
        </Card>

        <Measures data={current} title={`${monthLabel(current.month)} so far`} />
        <Measures data={previous} title={monthLabel(previous.month)} />

        <Card aria-labelledby="reports-title">
          <CardHeader
            id="reports-title"
            title="Published on the Support pages"
            description={`On the 2nd of each month, last month's response times are worked out. A month with at least ${MIN_PUBLISH} tickets is published on the help centre and the console's Support page${published ? "." : " once Service standards is on in Features. It's off now."}`}
          />
          {reports.length ? (
            <ul className="divide-y divide-border">
              {reports.map((r) => (
                <li key={r.month} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                  <span className="text-ink">
                    {monthLabel(r.month)}, {r.tickets} {r.tickets === 1 ? "ticket" : "tickets"}
                  </span>
                  <Badge tone={r.published ? "positive" : "neutral"}>{r.published ? "Published" : "Too few to publish"}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-ink-muted">Nothing worked out yet. The first report comes on the 2nd of next month.</p>
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}
