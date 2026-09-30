import type { Metadata } from "next";
import { MarketHome, marketHomeMetadata } from "@/components/site/market-home";

type Props = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return marketHomeMetadata((await params).market);
}

/** The market's home page: from the website editor once it has one, otherwise the built-in page. */
export default async function MarketHomePage({ params }: Props) {
  return <MarketHome code={(await params).market} />;
}
