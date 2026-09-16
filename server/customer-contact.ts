// Legacy customers require a unique email. Phone-only admin orders use a reserved,
// non-deliverable identity; never show it as contact information or send to it.
export function contactEmail(value: unknown): string {
  const email = String(value ?? "");
  return email.endsWith("@manual.invalid") ? "" : email;
}
