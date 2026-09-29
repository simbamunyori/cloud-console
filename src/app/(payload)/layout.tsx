import config from "@payload-config";
import "@payloadcms/next/css";
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import type { ServerFunctionClient } from "payload";
import { poppins } from "../fonts";
import { importMap } from "./admin/content/importMap";

const serverFunction: ServerFunctionClient = async function (args) {
  "use server";
  return handleServerFunctions({ ...args, config, importMap });
};

/** The website editor's own page frame (Payload's), separate from the site and consoles. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {/* The brand's typeface; Payload keeps its own colours for its controls. */}
      <style>{`:root { --font-body: ${poppins.style.fontFamily}; }`}</style>
      {children}
    </RootLayout>
  );
}
