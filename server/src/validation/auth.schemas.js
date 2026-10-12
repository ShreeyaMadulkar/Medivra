'use strict';
const { z } = require('zod');

const squash = (s) => s.replace(/\s+/g, ' ');

const email = z
  .string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'));

// Same rules as the frontend password checklist (src/services/security.ts), enforced server-side.
const password = z
  .string({ error: 'Password is required.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[A-Z]/, 'Password needs an uppercase letter.')
  .regex(/\d/, 'Password needs a number.')
  .regex(/[^A-Za-z0-9]/, 'Password needs a special character.');

const registerBody = z
  .object({
    name: z.string({ error: 'Name is required.' }).trim().transform(squash).pipe(z.string().min(2, 'Enter your full name.').max(100)),
    email,
    phone: z.string({ error: 'Phone is required.' }).trim().regex(/^[+\d][\d\s-]{7,}$/, 'Enter a valid phone number.').max(20, 'Phone number is too long.'),
    organization: z
      .string({ error: 'Organization is required.' })
      .trim()
      .transform(squash)
      .pipe(z.string().min(2, 'Enter your organization.').max(150)),
    role: z.enum(['DISTRIBUTOR', 'PHARMACY'], { error: 'Role must be DISTRIBUTOR or PHARMACY.' }),
    password,
  })
  .strict(); // unknown fields (e.g. status, organizationId) are rejected, not silently accepted

// Login is deliberately lenient: no complexity rules, so responses reveal nothing about accounts.
const loginBody = z
  .object({
    email: z.string({ error: 'Email is required.' }).trim().toLowerCase().min(1, 'Email is required.').max(254),
    password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(128),
    role: z.enum(['ADMIN', 'DISTRIBUTOR', 'PHARMACY']).optional(), // optional "Sign in as" selector from the UI
  })
  .strict();

module.exports = { registerBody, loginBody, passwordSchema: password };
