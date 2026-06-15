import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { computeGroupBalances, suggestSettlements, getExchangeRateForDate } from '../balanceEngine.js';
import prisma from '../../prisma.js';

describe('Balance Engine - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Currency Conversion Lookup', () => {
    test('should query database exchange rate for a given date', async () => {
      jest.spyOn(prisma.exchangeRate, 'findFirst').mockResolvedValue({
        id: 1,
        fromCurrency: 'USD',
        toCurrency: 'INR',
        rate: 83.65,
        effectiveDate: new Date('2026-02-01T00:00:00Z')
      });

      const rate = await getExchangeRateForDate(new Date('2026-02-15'), 'USD', 'INR');
      expect(rate).toBe(83.65);
      expect(prisma.exchangeRate.findFirst).toHaveBeenCalled();
    });

    test('should fall back to standard rate if no matching rate is in DB', async () => {
      jest.spyOn(prisma.exchangeRate, 'findFirst').mockResolvedValue(null);

      const rate = await getExchangeRateForDate(new Date('2026-02-15'), 'USD', 'INR');
      expect(rate).toBe(83.50);
    });
  });

  describe('Debt Settlement Suggestion (Min-Flow)', () => {
    test('should simplify balances into minimum number of transactions', () => {
      const mockBalances = [
        { userId: 1, name: 'Aisha', email: 'a@a.com', netBalance: 1000 },
        { userId: 2, name: 'Rohan', email: 'r@r.com', netBalance: -400 },
        { userId: 3, name: 'Priya', email: 'p@p.com', netBalance: -600 }
      ];

      const suggestions = suggestSettlements(mockBalances);
      expect(suggestions).toHaveLength(2);
      expect(suggestions).toContainEqual({
        fromUserId: 3,
        fromUserName: 'Priya',
        toUserId: 1,
        toUserName: 'Aisha',
        amount: 600
      });
      expect(suggestions).toContainEqual({
        fromUserId: 2,
        fromUserName: 'Rohan',
        toUserId: 1,
        toUserName: 'Aisha',
        amount: 400
      });
    });
  });

  describe('Membership Timeline Balance Checks', () => {
    test('should calculate balances respecting membership timeline constraints', async () => {
      // Mock Users and Memberships
      // Meera joined Jan 1, left March 31
      // Sam joined April 15, left null
      // Aisha, Rohan joined Jan 1, active
      jest.spyOn(prisma.groupMember, 'findMany').mockResolvedValue([
        { userId: 1, joinedAt: new Date('2026-01-01'), leftAt: null, user: { id: 1, name: 'Aisha', email: 'a@a.com' } },
        { userId: 2, joinedAt: new Date('2026-01-01'), leftAt: null, user: { id: 2, name: 'Rohan', email: 'r@r.com' } },
        { userId: 3, joinedAt: new Date('2026-01-01'), leftAt: new Date('2026-03-31T23:59:59Z'), user: { id: 3, name: 'Meera', email: 'm@m.com' } },
        { userId: 4, joinedAt: new Date('2026-04-15'), leftAt: null, user: { id: 4, name: 'Sam', email: 's@s.com' } }
      ]);

      // Mock Exchange Rate
      jest.spyOn(prisma.exchangeRate, 'findFirst').mockResolvedValue({ rate: 80.00 });

      // Mock Expenses:
      // 1. Expense in March (Meera active, Sam inactive)
      //    Payer: Aisha, Amount: 3000 INR, Split Equal
      //    Participants: Aisha, Rohan, Meera (1000 each)
      // 2. Expense in April (Meera inactive, Sam active)
      //    Payer: Rohan, Amount: 1200 INR, Split Equal
      //    Participants: Aisha, Rohan, Sam (400 each)
      jest.spyOn(prisma.expense, 'findMany').mockResolvedValue([
        {
          id: 101,
          groupId: 1,
          description: 'March Rent',
          amount: 3000,
          currency: 'INR',
          paidByUserId: 1,
          expenseDate: new Date('2026-03-10'),
          transactionType: 'EXPENSE',
          shares: [
            { userId: 1, shareAmount: 1000 },
            { userId: 2, shareAmount: 1000 },
            { userId: 3, shareAmount: 1000 }
          ]
        },
        {
          id: 102,
          groupId: 1,
          description: 'April Internet',
          amount: 1200,
          currency: 'INR',
          paidByUserId: 2,
          expenseDate: new Date('2026-04-20'),
          transactionType: 'EXPENSE',
          shares: [
            { userId: 1, shareAmount: 400 },
            { userId: 2, shareAmount: 400 },
            { userId: 4, shareAmount: 400 }
          ]
        }
      ]);

      // Mock Settlements: none
      jest.spyOn(prisma.settlement, 'findMany').mockResolvedValue([]);

      const result = await computeGroupBalances(1);
      
      const aishaBal = result.balances.find(b => b.userId === 1).netBalance;
      const rohanBal = result.balances.find(b => b.userId === 2).netBalance;
      const meeraBal = result.balances.find(b => b.userId === 3).netBalance;
      const samBal = result.balances.find(b => b.userId === 4).netBalance;

      // Aisha: Paid 3000, owes 1000 (March Rent) + owes 400 (April Internet) = +1600
      expect(aishaBal).toBe(1600);

      // Rohan: Paid 1200, owes 1000 (March Rent) + owes 400 (April Internet) = -200
      expect(rohanBal).toBe(-200);

      // Meera: Owes 1000 (March Rent), did not participate in April = -1000
      expect(meeraBal).toBe(-1000);

      // Sam: Owes 400 (April Internet), did not participate in March = -400
      expect(samBal).toBe(-400);

      // Settlement suggestions: Meera owes Aisha 1000, Sam owes Aisha 400, Rohan owes Aisha 200
      expect(result.settlementSuggestions).toContainEqual({
        fromUserId: 3,
        fromUserName: 'Meera',
        toUserId: 1,
        toUserName: 'Aisha',
        amount: 1000
      });
      expect(result.settlementSuggestions).toContainEqual({
        fromUserId: 4,
        fromUserName: 'Sam',
        toUserId: 1,
        toUserName: 'Aisha',
        amount: 400
      });
      expect(result.settlementSuggestions).toContainEqual({
        fromUserId: 2,
        fromUserName: 'Rohan',
        toUserId: 1,
        toUserName: 'Aisha',
        amount: 200
      });
    });
  });
});
