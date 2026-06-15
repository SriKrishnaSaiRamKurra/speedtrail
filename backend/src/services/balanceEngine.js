import prisma from '../prisma.js';

// Helper: Get exchange rate for a date
export async function getExchangeRateForDate(date, fromCurrency = 'USD', toCurrency = 'INR') {
  if (fromCurrency === toCurrency) return 1.0;
  
  // Find the rate where effectiveDate <= date, sorted by effectiveDate desc
  const rateRecord = await prisma.exchangeRate.findFirst({
    where: {
      fromCurrency,
      toCurrency,
      effectiveDate: {
        lte: date
      }
    },
    orderBy: {
      effectiveDate: 'desc'
    }
  });

  if (rateRecord) {
    return parseFloat(rateRecord.rate);
  }
  
  // Default fallback rates
  if (fromCurrency === 'USD' && toCurrency === 'INR') {
    return 83.50;
  }
  return 1.0;
}

// Compute the balances for a group
export async function computeGroupBalances(groupId) {
  // 1. Fetch group members and their active timelines
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true }
  });

  // Initialize balances map
  const balances = {};
  const userMap = {};
  for (const m of members) {
    balances[m.userId] = 0.0;
    userMap[m.userId] = m.user;
  }

  // 2. Fetch all group expenses, including their split shares
  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: {
      shares: true
    }
  });

  // 3. Process expenses
  for (const exp of expenses) {
    const expenseDate = new Date(exp.expenseDate);
    const amount = parseFloat(exp.amount);
    
    // Fetch the effective exchange rate for this expense's date
    const rate = await getExchangeRateForDate(expenseDate, exp.currency, 'INR');
    const amountInBase = amount * rate;
    const isRefund = exp.transactionType === 'REFUND';

    // Payer adjustment
    if (balances[exp.paidByUserId] !== undefined) {
      if (isRefund) {
        // Refund: Payer received money back, so their balance goes down (they owe the group)
        balances[exp.paidByUserId] -= amountInBase;
      } else {
        // Regular expense: Payer paid for the group, so their balance goes up (group owes them)
        balances[exp.paidByUserId] += amountInBase;
      }
    }

    // Shares adjustments
    for (const share of exp.shares) {
      const shareAmt = parseFloat(share.shareAmount);
      const shareAmtInBase = shareAmt * rate;

      if (balances[share.userId] !== undefined) {
        if (isRefund) {
          // Refund: Participants receive money back, so their balance goes up
          balances[share.userId] += shareAmtInBase;
        } else {
          // Regular expense: Participants owe their share, so their balance goes down
          balances[share.userId] -= shareAmtInBase;
        }
      }
    }
  }

  // 4. Fetch all group settlements
  const settlements = await prisma.settlement.findMany({
    where: { groupId }
  });

  // 5. Process settlements
  // A settlement is fromUser paying toUser.
  // fromUser gets a credit (their debt is reduced/cleared), so they get +amount.
  // toUser gets a debit (they received the cash, reducing their credit), so they get -amount.
  for (const set of settlements) {
    const amount = parseFloat(set.amount);
    if (balances[set.fromUserId] !== undefined) {
      balances[set.fromUserId] += amount;
    }
    if (balances[set.toUserId] !== undefined) {
      balances[set.toUserId] -= amount;
    }
  }

  // 6. Format response
  const individualBalances = Object.keys(balances).map(userId => {
    const uId = parseInt(userId, 10);
    return {
      userId: uId,
      name: userMap[uId].name,
      email: userMap[uId].email,
      netBalance: Math.round(balances[uId] * 100) / 100 // round to 2 decimals
    };
  });

  // 7. Generate settlement suggestions (min-flow algorithm)
  const suggestions = suggestSettlements(individualBalances);

  return {
    groupId,
    balances: individualBalances,
    settlementSuggestions: suggestions
  };
}

// Greedy Min-Flow Debt Simplification Algorithm
export function suggestSettlements(balances) {
  // Clone to avoid mutation
  const users = balances.map(u => ({ ...u }));

  // Separate debtors and creditors
  // We use a threshold of 0.01 to avoid floating-point issues
  const debtors = users.filter(u => u.netBalance < -0.01).sort((a, b) => a.netBalance - b.netBalance); // most negative first
  const creditors = users.filter(u => u.netBalance > 0.01).sort((a, b) => b.netBalance - a.netBalance); // most positive first

  const suggestions = [];

  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const debtAmount = Math.abs(debtor.netBalance);
    const creditAmount = creditor.netBalance;

    const settlementAmount = Math.min(debtAmount, creditAmount);
    const roundedAmount = Math.round(settlementAmount * 100) / 100;

    if (roundedAmount > 0) {
      suggestions.push({
        fromUserId: debtor.userId,
        fromUserName: debtor.name,
        toUserId: creditor.userId,
        toUserName: creditor.name,
        amount: roundedAmount
      });
    }

    // Update balances
    debtor.netBalance += settlementAmount;
    creditor.netBalance -= settlementAmount;

    // Advance indices if balance is settled
    if (Math.abs(debtor.netBalance) < 0.01) {
      dIdx++;
    }
    if (creditor.netBalance < 0.01) {
      cIdx++;
    }
  }

  return suggestions;
}
