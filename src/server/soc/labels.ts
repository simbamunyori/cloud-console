import type { DeviceHealth, IncidentSeverity, IncidentStatus, SecurityTenantStatus } from "@prisma/client";

/** Words for the SOC's states, shared by pages and emails (STRATEGY_ROLLOUT U5). */

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = { NEW: "New", INVESTIGATING: "Investigating", CONTAINED: "Contained", RESOLVED: "Resolved" };
export const HEALTH_LABEL: Record<DeviceHealth, string> = { HEALTHY: "Protected", AT_RISK: "At risk", OFFLINE: "Offline", UNPROTECTED: "Not protected" };
export const TENANT_STATUS_LABEL: Record<SecurityTenantStatus, string> = { PENDING: "Being set up", ACTIVE: "Active", SUSPENDED: "Suspended", REMOVED: "Removed" };
/** Badge tones for severities. */
export const SEVERITY_TONE = { LOW: "neutral", MEDIUM: "warning", HIGH: "negative", CRITICAL: "negative" } as const satisfies Record<IncidentSeverity, string>;
