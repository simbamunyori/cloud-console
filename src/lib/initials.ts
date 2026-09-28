/** "Sydney" → "SY", "Simba Munyori" → "SM". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] ?? "");
  return (parts[0][0] + second).toUpperCase();
}

/** "NSMC's", "Fourth Generation Technologies'". */
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name}'` : `${name}'s`;
}
