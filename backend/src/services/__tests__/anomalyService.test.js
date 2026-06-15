import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { parseDateString, parseAmountString, parseSplitDetails, detectAnomalies } from '../anomalyService.js';
import prisma from '../../prisma.js';

describe('Anomaly Service - Unit Tests', () => {
  beforeEach(() => {
    // Clear and reset mocks before each test
    jest.clearAllMocks();
    
    // Default mocks to prevent database hits
    jest.spyOn(prisma.expense, 'findMany').mockResolvedValue([]);
  });

  afterEach(() => {
    // Restore all spies to their original state
    jest.restoreAllMocks();
  });

  describe('Date Parser', () => {
    test('should parse ISO YYYY-MM-DD format', () => {
      const res = parseDateString('2026-02-01');
      expect(res.isValid).toBe(true);
      expect(res.normalized.toISOString().split('T')[0]).toBe('2026-02-01');
      expect(res.isAmbiguous).toBe(false);
    });

    test('should parse DD/MM/YYYY format where day is unambiguous (>12)', () => {
      const res = parseDateString('14/03/2026');
      expect(res.isValid).toBe(true);
      expect(res.normalized.toISOString().split('T')[0]).toBe('2026-03-14');
      expect(res.isAmbiguous).toBe(false);
    });

    test('should parse MM/DD/YYYY format where day is unambiguous', () => {
      const res = parseDateString('03/15/2026');
      expect(res.isValid).toBe(true);
      expect(res.normalized.toISOString().split('T')[0]).toBe('2026-03-15');
      expect(res.isAmbiguous).toBe(false);
    });

    test('should flag ambiguous date where month and day are both <=12', () => {
      const res = parseDateString('04/05/2026');
      expect(res.isValid).toBe(true);
      expect(res.isAmbiguous).toBe(true);
      expect(res.needsReview).toBe(true);
    });

    test('should parse spelled-out dates (Mar 14)', () => {
      const res = parseDateString('Mar 14');
      expect(res.isValid).toBe(true);
      expect(res.normalized.toISOString().split('T')[0]).toBe('2026-03-14');
    });

    test('should flag invalid date strings', () => {
      const res = parseDateString('Not-A-Date');
      expect(res.isValid).toBe(false);
      expect(res.needsReview).toBe(true);
    });
  });

  describe('Amount Parser', () => {
    test('should parse plain numbers', () => {
      const res = parseAmountString('1500');
      expect(res.isValid).toBe(true);
      expect(res.value).toBe(1500);
      expect(res.hasFormatting).toBe(false);
    });

    test('should parse numbers with commas and currency symbols', () => {
      const res = parseAmountString('$1,250.00');
      expect(res.isValid).toBe(true);
      expect(res.value).toBe(1250);
      expect(res.hasFormatting).toBe(true);
    });

    test('should handle negative amounts', () => {
      const res = parseAmountString('-850');
      expect(res.isValid).toBe(true);
      expect(res.value).toBe(-850);
    });
  });

  describe('Split Details Parser', () => {
    test('should parse key-value splits from CSV text format', () => {
      const res = parseSplitDetails('Amit: 60, Priya: 30');
      expect(res).toHaveLength(2);
      expect(res[0]).toEqual({ rawName: 'Amit', value: 60 });
      expect(res[1]).toEqual({ rawName: 'Priya', value: 30 });
    });

    test('should handle empty split details', () => {
      const res = parseSplitDetails('');
      expect(res).toEqual([]);
    });
  });

  describe('Full Row Anomaly Detection', () => {
    test('should flag missing payer, missing currency, and convert negative amounts', async () => {
      jest.spyOn(prisma.user, 'findMany').mockResolvedValue([
        { id: 1, name: 'Priya', email: 'priya@flatmates.com', passwordHash: 'hash', createdAt: new Date() }
      ]);
      jest.spyOn(prisma.groupMember, 'findMany').mockResolvedValue([]);

      const mockRow = {
        Date: '2026-02-01',
        Description: 'Refund ticket',
        'Paid By': '',
        Amount: '-850.00',
        Currency: '',
        'Split Type': 'EQUAL',
        'Split Details': ''
      };

      const result = await detectAnomalies(mockRow, 2, 1, 'test-batch', []);
      
      expect(result.needsReview).toBe(true);
      const types = result.anomalies.map(a => a.anomalyType);
      
      expect(types).toContain('MISSING_PAYER');
      expect(types).toContain('MISSING_CURRENCY');
      expect(types).toContain('NEGATIVE_AMOUNT');
      
      expect(result.parsedValues.amount).toBe(850);
      expect(result.parsedValues.transactionType).toBe('REFUND');
      expect(result.parsedValues.currency).toBe('INR');
    });

    test('should check duplicate transactions in batch', async () => {
      jest.spyOn(prisma.user, 'findMany').mockResolvedValue([
        { id: 1, name: 'Priya', email: 'priya@flatmates.com', passwordHash: 'hash', createdAt: new Date() }
      ]);
      jest.spyOn(prisma.expense, 'findMany').mockResolvedValue([]); // DB mock empty
      jest.spyOn(prisma.groupMember, 'findMany').mockResolvedValue([]);

      const mockRow = {
        Date: '2026-06-15',
        Description: 'Internet Bill',
        'Paid By': 'Priya',
        Amount: '1500.00',
        Currency: 'INR',
        'Split Type': 'EQUAL',
        'Split Details': ''
      };

      const processedRows = [
        {
          rowNumber: 2,
          paidByUserId: 1,
          expenseDate: new Date('2026-06-15T12:00:00Z'),
          amount: 1500,
          currency: 'INR',
          description: 'Internet Bill'
        }
      ];

      const result = await detectAnomalies(mockRow, 3, 1, 'test-batch', processedRows);
      expect(result.parsedValues.duplicateFlag).toBe(true);
      expect(result.anomalies.map(a => a.anomalyType)).toContain('DUPLICATE_EXPENSE');
    });

    test('should detect split percentage total mismatches', async () => {
      jest.spyOn(prisma.user, 'findMany').mockResolvedValue([
        { id: 1, name: 'Priya', email: 'priya@flatmates.com', passwordHash: 'hash', createdAt: new Date() },
        { id: 2, name: 'Rohan', email: 'rohan@flatmates.com', passwordHash: 'hash', createdAt: new Date() }
      ]);
      jest.spyOn(prisma.groupMember, 'findMany').mockResolvedValue([]);

      const mockRow = {
        Date: '2026-05-15',
        Description: 'Dinner',
        'Paid By': 'Priya',
        Amount: '1000.00',
        Currency: 'INR',
        'Split Type': 'PERCENTAGE',
        'Split Details': 'Priya: 60, Rohan: 50' // sum = 110%
      };

      const result = await detectAnomalies(mockRow, 2, 1, 'test-batch', []);
      expect(result.needsReview).toBe(true);
      expect(result.anomalies.map(a => a.anomalyType)).toContain('INVALID_PERCENTAGE_SPLIT');
    });
  });
});
