import type { Metadata } from "next";
import Link from "next/link";
import { RenderBlocks } from "@/components/site/blocks";
import { LegalView } from "@/components/site/legal-document";
import { AssistantNotice, PageIntro, ProseSection } from "@/components/site/prose";
import { SitePage } from "@/components/site/site-page";
import { company, DELETION_NOTICE_DAYS } from "@/config/app";
import { marketCopy } from "@/config/site";
import { CATCH_ALL } from "@/lib/domain/markets";
import { cmsPage, legalPage } from "@/server/site/cms";
import { cmsMetadata } from "@/server/site/cms-metadata";
import { siteMarket, siteMetadata } from "@/server/site/site";

type Props = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  const fallback = {
    title: `Security and data protection | ${company.name}`,
    description: "Two-step login on every account, every staff action shown to you, tested backups, and an assistant that only reads what a question needs.",
  };
  const source = (await legalPage(m.code, "data-protection")) ?? (await cmsPage(m.code, "security"));
  return source ? cmsMetadata(m.code, "/security", source, fallback) : siteMetadata(m.code, "/security", fallback);
}

/**
 * Security and data protection. A market with its own data protection
 * text (the editor's legal page) shows that; others show the editor's
 * "security" page of product facts, or the built-in one until it has one.
 */
export default async function SecurityPage({ params }: Props) {
  const m = await siteMarket((await params).market);
  const where = m.code === CATCH_ALL ? "your country" : m.name;
  const legal = await legalPage(m.code, "data-protection");
  if (legal) {
    return (
      <SitePage code={m.code} path="/security">
        <LegalView doc={legal} market={m}>
          <ProseSection id="assistant" title="Product notice: the assistant">
            <AssistantNotice countryName={where} />
          </ProseSection>
        </LegalView>
      </SitePage>
    );
  }
  const page = await cmsPage(m.code, "security");
  if (page) {
    return (
      <SitePage code={m.code} path="/security">
        <RenderBlocks blocks={page.layout} market={m} style={page.style} />
      </SitePage>
    );
  }
  return (
    <SitePage code={m.code} path="/security">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 lg:py-16">
        <PageIntro kicker="Security and data protection" title="Security done for you.">
          What we do to keep your accounts and data safe, and what you can see for yourself.
        </PageIntro>

        <ProseSection id="sign-in" title="Two-step login on every account">
          <p>Every person who signs in to the Cloud Console uses a password and a code from an authenticator app. There is no way to turn it off. Passwords are stored only as a one-way hash, and the secret behind each authenticator is encrypted.</p>
        </ProseSection>

        <ProseSection id="staff" title="Every staff action, shown to you">
          <p>Our team can see your account to support you and set up what you order. Anything they change appears in your organisation&apos;s activity log, with their name. You can&apos;t hide it and neither can they.</p>
        </ProseSection>

        <ProseSection id="data" title="Where your data is kept">
          <p>The Cloud Console and its database run on our servers in the United States, and are moving to a data centre in Botswana. An encrypted backup copy is kept off-site for 30 days. We never see your full card number: the card company handles it.</p>
          {marketCopy(m.code).localHosting ? <p>{marketCopy(m.code).localHosting}</p> : null}
          <p>Nothing you own is deleted without {DELETION_NOTICE_DAYS} days&apos; notice.</p>
        </ProseSection>

        <ProseSection id="assistant" title="The assistant">
          <AssistantNotice countryName={where} />
        </ProseSection>

        <ProseSection id="law" title="Data protection law">
          {m.dataProtectionLaw ? (
            <p>
              Customers in {m.name} are covered by the {m.dataProtectionLaw}. Our{" "}
              <Link href={`/${m.code}/legal/data-protection`} className="text-link underline">
                data protection page
              </Link>{" "}
              sets out how we meet it.
            </p>
          ) : (
            <p>
              Our{" "}
              <Link href={`/${m.code}/legal/data-protection`} className="text-link underline">
                data protection page
              </Link>{" "}
              sets out how we handle personal data and the rights you have.
            </p>
          )}
          <p>
            Questions about your data go to{" "}
            <a href={`mailto:${m.supportEmail}`} className="text-link underline">
              {m.supportEmail}
            </a>
            .
          </p>
        </ProseSection>
      </div>
    </SitePage>
  );
}
