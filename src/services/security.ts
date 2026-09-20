export const SECURITY_CONFIG = {
  maxFailedAttempts: 3,
  lockoutSeconds: 30, // short so the lockout is easy to demo; production value would be minutes
};

/** Demo-only credential check. BACKEND: POST /api/auth/login -> compare SHA-512(salt + password) with stored hash. */
export const DEMO_PASSWORD = 'Medivra@123';
export const verifyCredentials = (password: string) => password === DEMO_PASSWORD;

export const PASSWORD_RULES = [
  { id: 'len', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'num', label: 'One number', test: (p: string) => /\d/.test(p) },
  { id: 'special', label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];
export const passwordValid = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

/** BACKEND PLACEHOLDER: hashing is done server-side. */
export async function hashPassword(_password: string): Promise<string> {
  throw new Error('SHA-512 hashing will be performed by the backend.');
}

/** BACKEND PLACEHOLDER: AES-256 encryption is done server-side. This is a NO-OP and returns the value unchanged. */
export function encryptSensitiveField<T>(value: T): T {
  return value;
}
