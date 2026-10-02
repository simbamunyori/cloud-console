/**
 * The Data Protection Act readiness checklist (final build, Milestone 8):
 * a short questionnaire, a score and the next steps, most important
 * first. It is a guide, not legal advice, and says so.
 */

export type Answer = "yes" | "partly" | "no";

export interface Question {
  key: string;
  text: string;
  /** What to do when the answer isn't yes. */
  step: string;
  /** Counts double: the basics a regulator asks about first. */
  weight: 1 | 2;
  /** Products that help, shown only while on sale. */
  products: string[];
}

export const QUESTIONS: Question[] = [
  {
    key: "inventory",
    text: "Do you know what personal information you hold, where it is kept and who can see it?",
    step: "List the personal information you hold: what it is, why you hold it, where it is kept and who can see it. Everything else builds on this list.",
    weight: 2,
    products: [],
  },
  {
    key: "officer",
    text: "Has someone been made responsible for data protection in your organisation?",
    step: "Name a person responsible for data protection, and make sure staff know who it is.",
    weight: 2,
    products: [],
  },
  {
    key: "notice",
    text: "Do you tell people, in a privacy notice, what you collect about them and why?",
    step: "Publish a privacy notice on your website and forms that says what you collect, why, how long you keep it and who you share it with.",
    weight: 1,
    products: [],
  },
  {
    key: "consent",
    text: "Where you rely on consent, such as for marketing, do you record who agreed and when?",
    step: "Record consent when you ask for it: who agreed, to what and when, and make it as easy to withdraw as it was to give.",
    weight: 1,
    products: [],
  },
  {
    key: "access",
    text: "Is access to personal information limited to the people who need it, with two-step login on every account?",
    step: "Turn on two-step login for every account, and give people access only to the information their work needs.",
    weight: 2,
    products: ["microsoft-365-business-premium", "google-workspace-business-plus"],
  },
  {
    key: "devices",
    text: "Are laptops and phones that hold personal information protected, updated and able to be wiped if lost?",
    step: "Protect every laptop and phone that holds personal information: encryption, automatic updates, and a way to wipe it if it is lost.",
    weight: 1,
    products: ["managed-detection-response", "microsoft-365-business-premium"],
  },
  {
    key: "backup",
    text: "Is personal information backed up, with a restore tested in the last year?",
    step: "Back up email, files and servers every day, and test a restore at least once a year so you know it works.",
    weight: 1,
    products: ["backup-microsoft-365", "backup-google-workspace", "server-backup"],
  },
  {
    key: "breach",
    text: "Do you have a written plan for a data breach, including who tells the regulator and the people affected?",
    step: "Write a short breach plan: how staff report an incident, who decides what to do, and who tells the regulator and the people affected.",
    weight: 2,
    products: [],
  },
  {
    key: "suppliers",
    text: "Do your contracts with suppliers who handle personal information, such as IT, payroll and cloud services, cover data protection?",
    step: "Check that every supplier who handles personal information for you has data protection terms in their contract.",
    weight: 1,
    products: [],
  },
  {
    key: "transfers",
    text: "Do you know which personal information is stored outside the country, for example in cloud services?",
    step: "Find out where your cloud services keep your data, and check the law allows it for each kind of information.",
    weight: 1,
    products: ["local-data-copy"],
  },
  {
    key: "retention",
    text: "Do you delete personal information once you no longer need it?",
    step: "Decide how long you keep each kind of personal information, and delete it when that time is up.",
    weight: 1,
    products: [],
  },
  {
    key: "training",
    text: "Have your staff been shown how to handle personal information safely in the last year?",
    step: "Give every member of staff a short session on handling personal information and spotting phishing, once a year.",
    weight: 1,
    products: [],
  },
];

const POINTS: Record<Answer, number> = { yes: 2, partly: 1, no: 0 };

export function parseAnswers(get: (key: string) => string): { answers: Record<string, Answer>; missing: string[] } {
  const answers: Record<string, Answer> = {};
  const missing: string[] = [];
  for (const q of QUESTIONS) {
    const v = get(q.key);
    if (v === "yes" || v === "partly" || v === "no") answers[q.key] = v;
    else missing.push(q.key);
  }
  return { answers, missing };
}

export function answersOf(value: unknown): Record<string, Answer> {
  const v = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(QUESTIONS.flatMap((q) => (v[q.key] === "yes" || v[q.key] === "partly" || v[q.key] === "no" ? [[q.key, v[q.key] as Answer]] : [])));
}

/** 0 to 100, with the basics counting double. */
export function readinessScore(answers: Record<string, Answer>): number {
  const max = QUESTIONS.reduce((n, q) => n + q.weight * 2, 0);
  const got = QUESTIONS.reduce((n, q) => n + q.weight * POINTS[answers[q.key] ?? "no"], 0);
  return Math.round((got / max) * 100);
}

/** The questions not answered yes, most important first: "no" before "partly", the basics before the rest. */
export function nextSteps(answers: Record<string, Answer>): (Question & { answer: Answer })[] {
  return QUESTIONS.flatMap((q, i) => (answers[q.key] === "yes" ? [] : [{ ...q, answer: answers[q.key] ?? "no", i }]))
    .sort((a, b) => b.weight * (2 - POINTS[b.answer]) - a.weight * (2 - POINTS[a.answer]) || a.i - b.i)
    .map(({ i: _, ...q }) => q);
}

export function band(score: number): { label: string; text: string } {
  if (score >= 80) return { label: "Well prepared", text: "You have the main pieces in place. Keep them up to date and close the gaps below." };
  if (score >= 50) return { label: "Getting there", text: "Some of the basics are in place. The steps below close the biggest gaps first." };
  return { label: "Just starting", text: "Most of the basics are still to do. Start with the first steps below: they matter most." };
}

/** Unclaimed checklists are deleted after this many days; one saved to an account is kept like a lead. */
export const READINESS_KEEP_DAYS = 30;
