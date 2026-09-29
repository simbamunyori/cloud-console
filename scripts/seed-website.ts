/**
 * The website editor's first content: the home page, in every market.
 * A server does this itself when it starts with an empty editor; this is
 * for a development database. Safe to rerun.
 *
 *   npm run cms:seed
 */
import config from "@payload-config";
import { getPayload } from "payload";
import { seedWebsite } from "@/cms/seed-home";

process.env.CONSOLE_JOBS = "off";
getPayload({ config })
  .then(seedWebsite)
  .then((done) => {
    console.log(done ?? "The website editor already has pages. Left as they are.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
