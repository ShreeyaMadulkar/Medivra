'use strict';
/** Phase 2 unit tests: no database needed. AES-256-GCM field encryption and Zod request schemas. */
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 ? process.env.JWT_SECRET : 'test-only-secret-test-only-secret-1234';
process.env.AES_SECRET = '4f1c9a7e2b6d8035a91e7c4b0d2f6a8e13579bdf02468ace1357924680bdf13a';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { encrypt, decrypt, assertCryptoReady } = require('../src/utils/fieldCrypto');

test('AES-256-GCM: round trip, random IV, tamper and context binding', () => {
  assertCryptoReady();
  const a = encrypt('Deliver to dock 4, call +91 98765 43210', 'transfers.notes');
  const b = encrypt('Deliver to dock 4, call +91 98765 43210', 'transfers.notes');
  assert.notEqual(a, b); // fresh IV every time
  assert.ok(a.startsWith('v1:') && !a.includes('dock'));
  assert.equal(decrypt(a, 'transfers.notes'), 'Deliver to dock 4, call +91 98765 43210');
  assert.equal(decrypt(encrypt('नमस्ते ✓', 'x'), 'x'), 'नमस्ते ✓'); // unicode
  assert.throws(() => decrypt(a, 'batches.notes')); // ciphertext cannot be moved to another column
  const parts = a.split(':');
  parts[3] = (parts[3][0] === '0' ? '1' : '0') + parts[3].slice(1); // flip ciphertext
  assert.throws(() => decrypt(parts.join(':'), 'transfers.notes'));
  const tag = a.split(':'); tag[2] = crypto.randomBytes(16).toString('hex');
  assert.throws(() => decrypt(tag.join(':'), 'transfers.notes')); // wrong auth tag
  assert.throws(() => decrypt('garbage', 'transfers.notes'));
  assert.equal(encrypt(null, 'x'), null);
  assert.equal(decrypt(null, 'x'), null);
});

test('AES_SECRET is validated (64 hex chars, not trivially weak)', () => {
  const path = require.resolve('../src/utils/fieldCrypto');
  const envPath = require.resolve('../src/config/env');
  const original = process.env.AES_SECRET;
  try {
    for (const bad of ['', 'short', 'z'.repeat(64), 'a'.repeat(63), '00'.repeat(32)]) {
      process.env.AES_SECRET = bad;
      delete require.cache[path]; delete require.cache[envPath];
      assert.throws(() => require('../src/utils/fieldCrypto').assertCryptoReady(), /AES_SECRET/, `"${bad}"`);
    }
  } finally {
    process.env.AES_SECRET = original;
    delete require.cache[path]; delete require.cache[envPath];
  }
});

test('Zod: batch, stock and transfer request schemas', () => {
  const s = require('../src/validation/core.schemas');
  const ok = { batchNumber: 'lot-77', medicineName: 'Amoxicillin', manufacturer: 'Acme', manufactureDate: '2025-01-01', expiryDate: '2099-01-01', quantity: 10, unitPrice: 4.5 };
  const p = s.createBatchBody.safeParse(ok);
  assert.ok(p.success);
  assert.equal(p.data.batchNumber, 'LOT-77');
  assert.equal(p.data.category, 'Other');
  for (const over of [{ quantity: 0 }, { quantity: -1 }, { quantity: 2.5 }, { quantity: '5' }, { unitPrice: -2 }, { unitPrice: 1.999 }, { expiryDate: '2024-12-31' },
    { expiryDate: '2020-01-01' }, { manufactureDate: '2099-02-01' }, { manufactureDate: '2025-02-30' }, { batchNumber: '??' }, { extra: 1 }]) {
    assert.equal(s.createBatchBody.safeParse({ ...ok, ...over }).success, false, JSON.stringify(over));
  }
  assert.equal(s.adjustStockBody.safeParse({ delta: -3, reason: 'Damaged' }).success, true);
  assert.equal(s.adjustStockBody.safeParse({ delta: 0, reason: 'Damaged' }).success, false);
  assert.equal(s.adjustStockBody.safeParse({ delta: 1.5, reason: 'Damaged' }).success, false);
  const t = { toOrganizationId: '5', items: [{ batchId: '9', quantity: 3 }] };
  assert.ok(s.createTransferBody.safeParse(t).success);
  assert.equal(s.createTransferBody.safeParse({ ...t, items: [] }).success, false);
  assert.equal(s.createTransferBody.safeParse({ ...t, items: [{ batchId: '9', quantity: 1 }, { batchId: '9', quantity: 1 }] }).success, false);
  assert.equal(s.createTransferBody.safeParse({ ...t, fromOrgId: '1' }).success, false);
  assert.equal(s.createTransferBody.safeParse({ ...t, toOrganizationId: '0' }).success, false);
  assert.equal(s.updateUserBody.safeParse({ role: 'ADMIN' }).success, false);
  assert.equal(s.updateUserBody.safeParse({}).success, false);
  assert.equal(s.updateOrganizationBody.safeParse({ type: 'PHARMACY' }).success, false);
  assert.equal(s.createUserBody.safeParse({ name: 'Ann Lee', email: 'a@b.co', phone: '+91 98765 43210', role: 'ADMIN', organizationId: '3', password: 'Medivra@123' }).success, false);
  assert.equal(s.createUserBody.safeParse({ name: 'Ann Lee', email: 'a@b.co', phone: '+91 98765 43210', role: 'PHARMACY', password: 'Medivra@123' }).success, false);
});
