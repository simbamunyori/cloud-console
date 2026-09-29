import type { ConnectorFamily } from "@prisma/client";
import { CONNECTOR_LABEL } from "@/server/admin/catalogue";

export const CONNECTOR_OPTIONS = (Object.keys(CONNECTOR_LABEL) as ConnectorFamily[]).map((c) => ({ value: c, label: CONNECTOR_LABEL[c] }));
