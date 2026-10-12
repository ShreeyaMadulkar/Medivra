/** Password rules shown on the Register form. The server enforces the same rules (server/src/validation/auth.schemas.js). */
export const PASSWORD_RULES = [
  { id: 'len', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'num', label: 'One number', test: (p: string) => /\d/.test(p) },
  { id: 'special', label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];
export const passwordValid = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

/** BACKEND PLACEHOLDER: AES-256 encryption is done server-side. This is a NO-OP and returns the value unchanged. */
export function encryptSensitiveField<T>(value: T): T {
  return value;
}
