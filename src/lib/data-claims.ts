/**
 * "Data kept in Botswana" wording is held back until our own platform moves
 * to the Botswana data centre (docs/STRATEGY_ROLLOUT.md, U1 item 5). Until
 * Admin > Features > "Say data is kept in Botswana" is on, catalogue lines
 * that say where data is kept or hosted in Botswana are left out. Other
 * selling points, such as off-site backup and the 24/7 SOC, stay.
 */
const BOTSWANA_DATA = /\b(hosted|stored|kept|held|located|stays?)\b[^.]*\b(gaborone|botswana)\b/i;

export const claimsBotswanaData = (line: string) => BOTSWANA_DATA.test(line);

export function withDataClaims(lines: string[], allowed: boolean): string[] {
  return allowed ? lines : lines.filter((l) => !claimsBotswanaData(l));
}
