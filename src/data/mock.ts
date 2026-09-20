import type { Activity, Batch, Category, Transfer, TransferStatus, User } from '../types';
import { addDays } from '../lib/utils';

export const DISTRIBUTOR_ORGS = ['Medivra Distributors', 'CareMed Distributors'];
export const PHARMACY_ORGS = ['Apollo Pharmacy', 'HealthPlus Pharmacy', 'LifeCare Pharmacy'];
export const MEDICINES = ['Paracetamol 500mg', 'Amoxicillin 250mg', 'Azithromycin 500mg', 'Cetirizine 10mg', 'Ibuprofen 400mg', 'Metformin 500mg', 'Insulin'];
export const CATEGORIES: Category[] = ['Analgesic', 'Antibiotic', 'Antihistamine', 'Antidiabetic', 'Other'];

const MD = 'Medivra Distributors';
const CD = 'CareMed Distributors';

const b = (id: string, batchNo: string, medicine: string, category: Category, manufacturer: string, quantity: number, unitPrice: number, mfgDate: string, expiryDate: string, owner: string, updatedBy: string, updatedAt: string): Batch =>
  ({ id, batchNo, medicine, category, manufacturer, quantity, unitPrice, mfgDate, expiryDate, owner, updatedBy, updatedAt });

export const seedBatches: Batch[] = [
  b('B-2041', 'AMX-26-011', 'Amoxicillin 250mg', 'Antibiotic', 'Cipla Ltd.', 120, 8.5, '2026-03-15', '2027-03-15', MD, 'John Smith', '2026-09-18T11:20:00'),
  b('B-2042', 'AZI-26-034', 'Azithromycin 500mg', 'Antibiotic', 'Sun Pharma', 1800, 21.0, '2026-02-20', '2027-08-20', MD, 'John Smith', '2026-09-15T10:05:00'),
  b('B-2043', 'CTZ-26-072', 'Cetirizine 10mg', 'Antihistamine', "Dr. Reddy's Laboratories", 2400, 2.75, '2026-01-10', '2028-01-10', MD, 'John Smith', '2026-09-10T09:40:00'),
  b('B-2044', 'IBU-25-198', 'Ibuprofen 400mg', 'Analgesic', 'Abbott India', 950, 3.4, '2025-11-05', '2026-11-05', MD, 'John Smith', '2026-09-12T14:15:00'),
  b('B-2045', 'MET-26-140', 'Metformin 500mg', 'Antidiabetic', 'Lupin Ltd.', 3200, 1.9, '2026-06-01', '2027-12-01', MD, 'John Smith', '2026-09-08T16:30:00'),
  b('B-2046', 'INS-26-009', 'Insulin', 'Antidiabetic', 'Novo Nordisk', 340, 640.0, '2026-02-28', '2027-02-28', MD, 'John Smith', '2026-09-17T12:10:00'),
  b('B-2047', 'AZI-26-020', 'Azithromycin 500mg', 'Antibiotic', 'Cipla Ltd.', 0, 20.5, '2026-01-05', '2027-05-01', MD, 'John Smith', '2026-09-05T10:00:00'),
  b('B-2048', 'PCM-26-041', 'Paracetamol 500mg', 'Analgesic', 'GlaxoSmithKline', 4000, 1.2, '2026-04-30', '2028-04-30', MD, 'John Smith', '2026-09-21T09:10:00'),
  b('B-2051', 'IBU-26-045', 'Ibuprofen 400mg', 'Analgesic', 'Abbott India', 1500, 3.5, '2026-05-12', '2028-05-12', CD, 'Rahul Mehta', '2026-09-12T13:00:00'),
  b('B-2052', 'MET-26-155', 'Metformin 500mg', 'Antidiabetic', 'Lupin Ltd.', 60, 1.95, '2026-07-08', '2028-07-08', CD, 'Rahul Mehta', '2026-09-20T15:45:00'),
  b('B-2036', 'PCM-26-030', 'Paracetamol 500mg', 'Analgesic', 'GlaxoSmithKline', 800, 1.3, '2026-03-02', '2028-03-02', 'Apollo Pharmacy', 'Sarah Patel', '2026-09-14T10:30:00'),
  b('B-2037', 'AMX-26-008', 'Amoxicillin 250mg', 'Antibiotic', 'Cipla Ltd.', 350, 9.0, '2026-02-11', '2027-02-11', 'Apollo Pharmacy', 'Sarah Patel', '2026-09-10T17:00:00'),
  b('B-2038', 'CTZ-26-060', 'Cetirizine 10mg', 'Antihistamine', "Dr. Reddy's Laboratories", 600, 3.0, '2026-04-18', '2028-04-18', 'HealthPlus Pharmacy', 'Priya Nair', '2026-09-13T11:00:00'),
];

export const seedUsers: User[] = [
  { id: 'U-001', name: 'John Doe', email: 'admin@medivra.com', phone: '+91 98200 11001', organization: 'Medivra Systems', role: 'ADMIN', status: 'Active', lastLogin: '2026-09-21T08:55:00' },
  { id: 'U-002', name: 'John Smith', email: 'john.smith@medivra.com', phone: '+91 98200 11002', organization: MD, role: 'DISTRIBUTOR', status: 'Active', lastLogin: '2026-09-21T09:02:00' },
  { id: 'U-003', name: 'Sarah Patel', email: 'sarah.patel@apollopharmacy.com', phone: '+91 98200 11003', organization: 'Apollo Pharmacy', role: 'PHARMACY', status: 'Active', lastLogin: '2026-09-20T17:40:00' },
  { id: 'U-004', name: 'Rahul Mehta', email: 'rahul.mehta@caremed.com', phone: '+91 98200 11004', organization: CD, role: 'DISTRIBUTOR', status: 'Active', lastLogin: '2026-09-20T15:40:00' },
  { id: 'U-005', name: 'Priya Nair', email: 'priya.nair@healthplus.com', phone: '+91 98200 11005', organization: 'HealthPlus Pharmacy', role: 'PHARMACY', status: 'Active', lastLogin: '2026-09-19T12:05:00' },
  { id: 'U-006', name: 'Amit Shah', email: 'amit.shah@lifecare.com', phone: '+91 98200 11006', organization: 'LifeCare Pharmacy', role: 'PHARMACY', status: 'Locked', lastLogin: '2026-09-16T10:20:00' },
  { id: 'U-007', name: 'Neha Kapoor', email: 'neha.kapoor@apollopharmacy.com', phone: '+91 98200 11007', organization: 'Apollo Pharmacy', role: 'PHARMACY', status: 'Inactive', lastLogin: '2026-08-30T09:00:00' },
];

const ORDER: TransferStatus[] = ['Pending', 'Approved', 'In Transit', 'Delivered'];

const t = (id: string, batchId: string, medicine: string, from: string, to: string, quantity: number, date: string, expectedDelivery: string, status: TransferStatus, createdBy: string, notes = ''): Transfer => {
  const at = (d: string, hm: string) => `${d}T${hm}:00`;
  const timeline = [{ at: at(date, '09:30'), label: 'Transfer created', by: createdBy }];
  if (status === 'Cancelled') {
    timeline.push({ at: at(addDays(date, 1), '11:00'), label: 'Transfer cancelled', by: createdBy });
  } else {
    const i = ORDER.indexOf(status);
    if (i >= 1) timeline.push({ at: at(date, '10:15'), label: 'Transfer approved', by: 'John Doe' });
    if (i >= 2) timeline.push({ at: at(addDays(date, 1), '14:00'), label: 'Shipment dispatched', by: createdBy });
    if (i >= 3) timeline.push({ at: at(expectedDelivery, '12:30'), label: 'Delivery confirmed', by: to });
  }
  return { id, batchId, medicine, from, to, quantity, date, expectedDelivery, status, notes, createdBy, timeline };
};

export const seedTransfers: Transfer[] = [
  t('TR-1017', 'B-2045', 'Metformin 500mg', MD, 'LifeCare Pharmacy', 600, '2026-09-08', '2026-09-10', 'Delivered', 'John Smith'),
  t('TR-1018', 'B-2043', 'Cetirizine 10mg', MD, 'Apollo Pharmacy', 400, '2026-09-10', '2026-09-12', 'Delivered', 'John Smith'),
  t('TR-1019', 'B-2051', 'Ibuprofen 400mg', CD, 'HealthPlus Pharmacy', 300, '2026-09-12', '2026-09-14', 'Delivered', 'Rahul Mehta'),
  t('TR-1020', 'B-2041', 'Amoxicillin 250mg', MD, 'HealthPlus Pharmacy', 250, '2026-09-14', '2026-09-16', 'Cancelled', 'John Smith', 'Cancelled: stock reserved for another order.'),
  t('TR-1021', 'B-2046', 'Insulin', MD, 'Apollo Pharmacy', 100, '2026-09-17', '2026-09-22', 'Approved', 'John Smith', 'Cold-chain delivery required (2-8 °C).'),
  t('TR-1022', 'B-2042', 'Azithromycin 500mg', MD, 'LifeCare Pharmacy', 300, '2026-09-19', '2026-09-24', 'Pending', 'John Smith'),
  t('TR-1023', 'B-2052', 'Metformin 500mg', CD, 'Apollo Pharmacy', 200, '2026-09-20', '2026-09-22', 'In Transit', 'Rahul Mehta'),
  t('TR-1024', 'B-2048', 'Paracetamol 500mg', MD, 'Apollo Pharmacy', 500, '2026-09-21', '2026-09-23', 'In Transit', 'John Smith', 'Regular monthly replenishment.'),
];

const a = (n: number, at: string, actor: string, org: string, action: string, ref?: string): Activity => ({ id: `A-${n}`, at, actor, org, action, ref });
export const seedActivity: Activity[] = [
  a(1, '2026-09-21T09:42:00', 'John Smith', MD, 'Transfer TR-1024 created', 'TR-1024'),
  a(2, '2026-09-21T09:10:00', 'John Smith', MD, 'Batch B-2048 added', 'B-2048'),
  a(3, '2026-09-21T08:55:00', 'John Doe', 'Medivra Systems', 'User logged in'),
  a(4, '2026-09-20T15:45:00', 'Rahul Mehta', CD, 'Distributor updated inventory', 'B-2052'),
  a(5, '2026-09-20T15:30:00', 'Rahul Mehta', CD, 'Transfer TR-1023 created', 'TR-1023'),
  a(6, '2026-09-19T16:10:00', 'Amit Shah', '', 'Failed login attempt'),
  a(7, '2026-09-19T16:12:00', 'Amit Shah', '', 'Account locked after repeated failed logins'),
  a(8, '2026-09-12T12:30:00', 'Apollo Pharmacy', 'Apollo Pharmacy', 'Pharmacy accepted transfer TR-1018', 'TR-1018'),
  a(9, '2026-09-10T09:30:00', 'John Smith', MD, 'Transfer TR-1018 created', 'TR-1018'),
  a(10, '2026-09-08T16:30:00', 'John Smith', MD, 'Distributor updated inventory', 'B-2045'),
];
