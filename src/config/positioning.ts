/**
 * What every customer gets, in the words of Change Request 01. Used by the
 * sign-in screens and the public site, so the promise reads the same
 * everywhere. No country is the headline; formatted amounts show the
 * currency.
 */
export const PROMISE = "Your cloud, handled.";

/** The supporting line under the site's headline (docs/STRATEGY_ROLLOUT.md, section 1). Editable per page in the website editor. */
export const SUPPORTING_LINE = "One account. One team. Cloud, security, resilience and connectivity, handled.";

export const OUTCOMES: [string, string][] = [
  ["One team instead of five suppliers", "Microsoft 365, Google Workspace, servers, hosting and security from one team."],
  ["One invoice in your currency", "Every line explained, with what changed since last month."],
  ["Support that answers", "Answers in seconds from the assistant, with a person behind it."],
  ["Security done for you", "Two-step login on every account, and backups that are checked."],
];
