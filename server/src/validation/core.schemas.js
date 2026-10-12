'use strict';
const { z } = require('zod');
const { registerBody } = require('./auth.schemas');
const { todayUtc } = require('../utils/http');

const squash = (s) => s.replace(/\s+/g, ' ');
const text = (label, min, max) =>
  z.string({ error: `${label} is required.` }).trim().transform(squash).pipe(z.string().min(min, `${label} is too short.`).max(max, `${label} is too long.`));
const qty = z.number({ error: 'Quantity must be a number.' }).int('Quantity must be a whole number.').min(1, 'Quantity must be at least 1.').max(10_000_000, 'Quantity is too large.');
const idString = (label) => z.string({ error: `${label} is required.` }).regex(/^[1-9]\d{0,18}$/, `Invalid ${label}.`);
const nonEmpty = (o) => Object.keys(o).length > 0;
const price = z.number({ error: 'Unit price must be a number.' }).min(0, 'Unit price cannot be negative.').max(10_000_000, 'Unit price is too large.')
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Unit price has at most 2 decimals.');
const CATEGORIES = ['Analgesic', 'Antibiotic', 'Antihistamine', 'Antidiabetic', 'Other'];

/* ---------------------------------------------------------------- admin */
const createOrganizationBody = z.strictObject({
  name: text('Organization name', 2, 150),
  type: z.enum(['DISTRIBUTOR', 'PHARMACY'], { error: 'Type must be DISTRIBUTOR or PHARMACY.' }),
});
const updateOrganizationBody = z
  .strictObject({
    name: text('Organization name', 2, 150).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine(nonEmpty, 'Provide at least one field to update.');

const createUserBody = z
  .strictObject({
    name: registerBody.shape.name,
    email: registerBody.shape.email,
    phone: registerBody.shape.phone,
    role: z.enum(['ADMIN', 'DISTRIBUTOR', 'PHARMACY']),
    organizationId: idString('organizationId').optional(),
    password: registerBody.shape.password,
  })
  .superRefine((v, ctx) => {
    if (v.role === 'ADMIN' && v.organizationId) ctx.addIssue({ code: 'custom', path: ['organizationId'], message: 'ADMIN accounts have no organization.' });
    if (v.role !== 'ADMIN' && !v.organizationId) ctx.addIssue({ code: 'custom', path: ['organizationId'], message: 'organizationId is required.' });
  });
const updateUserBody = z
  .strictObject({
    name: registerBody.shape.name.optional(),
    phone: registerBody.shape.phone.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  })
  .refine(nonEmpty, 'Provide at least one field to update.');

/* ---------------------------------------------------------------- batches */
const dateField = (label) => z.iso.date({ error: `${label} must be a valid date (YYYY-MM-DD).` });

const batchFields = {
  batchNumber: z.string({ error: 'Batch number is required.' }).trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._/-]{1,49}$/, 'Batch number: 2-50 letters, digits, . _ / -'),
  medicineName: text('Medicine name', 2, 150),
  category: z.enum(CATEGORIES).default('Other'),
  manufacturer: text('Manufacturer', 2, 150),
  manufactureDate: dateField('Manufacture date'),
  expiryDate: dateField('Expiry date'),
  unitPrice: price,
  notes: z.string().trim().max(500).optional(),
};

const createBatchBody = z
  .strictObject({ ...batchFields, unitPrice: price.default(0), quantity: qty })
  .superRefine((v, ctx) => {
    const today = todayUtc();
    if (v.manufactureDate > today) ctx.addIssue({ code: 'custom', path: ['manufactureDate'], message: 'Manufacture date cannot be in the future.' });
    if (v.expiryDate <= v.manufactureDate) ctx.addIssue({ code: 'custom', path: ['expiryDate'], message: 'Expiry date must be after the manufacture date.' });
    if (v.expiryDate <= today) ctx.addIssue({ code: 'custom', path: ['expiryDate'], message: 'Cannot register an already expired batch.' });
  });

// Identity fields (number, medicine, manufacturer, dates) are editable only while no transfer references the batch.
const updateBatchBody = z
  .strictObject({
    batchNumber: batchFields.batchNumber.optional(),
    medicineName: batchFields.medicineName.optional(),
    manufacturer: batchFields.manufacturer.optional(),
    manufactureDate: batchFields.manufactureDate.optional(),
    expiryDate: batchFields.expiryDate.optional(),
    category: z.enum(CATEGORIES).optional(),
    unitPrice: price.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine(nonEmpty, 'Provide at least one field to update.');

const adjustStockBody = z.strictObject({
  delta: z.number({ error: 'delta must be a number.' }).int('delta must be a whole number.').refine((n) => n !== 0, 'delta cannot be 0.').refine((n) => Math.abs(n) <= 10_000_000, 'delta is too large.'),
  reason: text('Reason', 3, 200),
});

/* ---------------------------------------------------------------- transfers */
const createTransferBody = z.strictObject({
  toOrganizationId: idString('toOrganizationId'),
  items: z
    .array(z.strictObject({ batchId: idString('batchId'), quantity: qty }), { error: 'items must be a list.' })
    .min(1, 'Add at least one item.')
    .max(50, 'At most 50 items per transfer.')
    .refine((a) => new Set(a.map((i) => i.batchId)).size === a.length, 'Each batch may appear only once.'),
  expectedDelivery: dateField('Expected delivery').optional(),
  notes: z.string().trim().max(1000).optional(),
});
const cancelTransferBody = z.strictObject({ reason: text('Reason', 3, 300).optional() });

module.exports = {
  createOrganizationBody, updateOrganizationBody, createUserBody, updateUserBody,
  createBatchBody, updateBatchBody, adjustStockBody, createTransferBody, cancelTransferBody,
};
