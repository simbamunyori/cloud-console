import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import tokens from "@/config/theme/tokens.json";
import { company } from "@/config/app";
import { prisma } from "@/server/db";
import { env } from "@/server/env";

/**
 * The branded share image for a product (Milestone 7), 1200 by 627 as
 * LinkedIn shows link images. Only for a live product whose page a
 * Publisher approved: the image always points at a page people can open.
 */

const WIDTH = 1200;
const HEIGHT = 627;

const asset = (...parts: string[]) => readFile(path.join(process.cwd(), "public", "brand", ...parts));

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kit = await prisma.launchKit.findFirst({ where: { pageApprovedAt: { not: null }, product: { slug, status: "LIVE" } }, include: { product: { include: { category: true } } } });
  if (!kit) return new Response("Not found", { status: 404 });
  const p = kit.product;
  const [bold, light, logo] = await Promise.all([asset("fonts", "Poppins-Bold.ttf"), asset("fonts", "Poppins-Light.ttf"), asset("logo", "fgt-logo-reverse.svg")]);
  const host = new URL(env().APP_URL).host;
  const b = tokens.brand;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", backgroundColor: b.navy, color: b.white, fontFamily: "Poppins" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} width={245} height={64} alt={company.name} />
          <div style={{ display: "flex", fontSize: 26, fontWeight: 300, color: b.inkOnDark }}>{host}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 980 }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: b.teal }}>{p.category.name}</div>
          <div style={{ display: "flex", fontSize: p.name.length > 32 ? 64 : 80, fontWeight: 700, lineHeight: 1.1 }}>{p.name}</div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 300, lineHeight: 1.4, color: b.inkOnDark }}>{p.summary}</div>
        </div>
        <div style={{ display: "flex", height: 10, borderRadius: 5, backgroundImage: b.gradient }} />
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Poppins", data: bold, weight: 700, style: "normal" },
        { name: "Poppins", data: light, weight: 300, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
