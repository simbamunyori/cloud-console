import type { Metadata } from "next";
import { MarketHome, marketHomeMetadata } from "@/components/site/market-home";

type Props = { params: Promise<{ market: string }>; searchParams: Promise<{ domain?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return marketHomeMetadata((await params).market);
}

/** The market's home page: from the website editor once it has one, otherwise the built-in page. */
export default async function MarketHomePage({ params, searchParams }: Props) {
  // ?domain= comes from the menu's domain search: the home page searches for it straight away.
  const q = (await searchParams).domain;
  const domain = typeof q === "string" ? q.trim().slice(0, 253) : undefined;
  return <MarketHome code={(await params).market} domain={domain || undefined} />;
}
