import prisma from '../prisma.js';

// Helper: Check if a user is an active member of the group on a specific date
async function isMemberActiveOnDate(groupId, userId, date) {
  const membership = await prisma.groupMember.findFirst({
    where: {
      groupId,
      userId,
      joinedAt: { lte: date }
    }
  });

  if (!membership) return false;
  // If leftAt is set, the date must be <= leftAt
  if (membership.leftAt && date > new Date(membership.leftAt)) {
    return false;
  }
  return true;
}

// Helper: Get list of all active user IDs in the group on a specific date
async function getActiveMemberUserIdsOnDate(groupId, date) {
  const memberships = await prisma.groupMember.findMany({
    where: {
      groupId,
      joinedAt: { lte: date }
    }
  });

  return memberships
    .filter(m => !m.leftAt || date <= new Date(m.leftAt))
    .map(m => m.userId);
}

// 1. Create Expense
export async function createExpense(req, res) {
  const { groupId } = req.params;
  const {
    description,
    amount,
    currency,
    paidByUserId,
    expenseDate,
    splitType, // EQUAL, PERCENTAGE, EXACT, SHARES
    shares, // Array of { userId: number, value: number } (value is %, exact amount, or shares ratio)
    transactionType // EXPENSE or REFUND (default: EXPENSE)
  } = req.body;

  const gId = parseInt(groupId, 10);
  const payerId = parseInt(paidByUserId, 10);
  const expDate = new Date(expenseDate);
  const parsedAmount = parseFloat(amount);

  try {
    // Basic validations
    if (!description || isNaN(parsedAmount) || !expenseDate || !splitType) {
      return res.status(400).json({ error: 'Missing required expense fields' });
    }

    // Validate payer is active on expenseDate
    const payerActive = await isMemberActiveOnDate(gId, payerId, expDate);
    if (!payerActive) {
      return res.status(400).json({
        error: `Payer (User ID ${payerId}) was not an active member on the expense date (${expenseDate.split('T')[0]}).`
      });
    }

    // Determine target participants and calculate their shares
    let calculatedShares = []; // array of { userId: number, shareAmount: Decimal, sharePercentage: Decimal? }

    const activeUserIds = await getActiveMemberUserIdsOnDate(gId, expDate);
    if (activeUserIds.length === 0) {
      return res.status(400).json({ error: 'No active members in the group on the expense date' });
    }

    if (splitType === 'EQUAL') {
      // EQUAL Split:
      // If specific shares/participants are listed, divide equally among them.
      // Otherwise, divide equally among ALL active members of the group.
      let targetUserIds = [];
      if (shares && shares.length > 0) {
        targetUserIds = shares.map(s => parseInt(s.userId, 10));
      } else {
        targetUserIds = activeUserIds;
      }

      // Check membership timelines for all participants
      for (const uId of targetUserIds) {
        if (!activeUserIds.includes(uId)) {
          return res.status(400).json({
            error: `Participant (User ID ${uId}) was not active on the expense date.`
          });
        }
      }

      const count = targetUserIds.length;
      const shareValue = parsedAmount / count;
      const roundedShare = Math.round(shareValue * 100) / 100;
      
      // Handle rounding error (difference goes to the payer or first participant)
      let sumOfShares = roundedShare * count;
      let diff = parsedAmount - sumOfShares;

      calculatedShares = targetUserIds.map((uId, idx) => {
        // Adjust the last share to account for division rounding errors
        const finalShare = idx === count - 1 ? roundedShare + diff : roundedShare;
        return {
          userId: uId,
          shareAmount: finalShare,
          sharePercentage: 100 / count
        };
      });

    } else if (splitType === 'PERCENTAGE') {
      // PERCENTAGE Split:
      // Shares contains percentage weights for each participant (e.g. 50%, 30%, 20%).
      // We check that the sum of percentages equals 100.
      if (!shares || shares.length === 0) {
        return res.status(400).json({ error: 'Split details (shares) are required for PERCENTAGE split' });
      }

      let totalPct = 0;
      for (const s of shares) {
        const uId = parseInt(s.userId, 10);
        if (!activeUserIds.includes(uId)) {
          return res.status(400).json({
            error: `Participant (User ID ${uId}) was not active on the expense date.`
          });
        }
        totalPct += parseFloat(s.value);
      }

      if (Math.abs(totalPct - 100) > 0.01) {
        return res.status(400).json({ error: `Percentages must total exactly 100% (got ${totalPct}%)` });
      }

      calculatedShares = shares.map(s => {
        const pct = parseFloat(s.value);
        return {
          userId: parseInt(s.userId, 10),
          shareAmount: Math.round((parsedAmount * (pct / 100)) * 100) / 100,
          sharePercentage: pct
        };
      });

      // Adjust rounding discrepancies
      const sumOfShares = calculatedShares.reduce((sum, s) => sum + s.shareAmount, 0);
      const diff = parsedAmount - sumOfShares;
      if (Math.abs(diff) > 0) {
        calculatedShares[calculatedShares.length - 1].shareAmount += diff;
      }

    } else if (splitType === 'EXACT') {
      // EXACT Split:
      // Shares contains exact currency amounts for each participant.
      // We verify the exact amounts add up to the total expense amount.
      if (!shares || shares.length === 0) {
        return res.status(400).json({ error: 'Split details (shares) are required for EXACT split' });
      }

      let totalAmount = 0;
      for (const s of shares) {
        const uId = parseInt(s.userId, 10);
        if (!activeUserIds.includes(uId)) {
          return res.status(400).json({
            error: `Participant (User ID ${uId}) was not active on the expense date.`
          });
        }
        totalAmount += parseFloat(s.value);
      }

      if (Math.abs(totalAmount - parsedAmount) > 0.01) {
        return res.status(400).json({
          error: `Exact split amounts must total the expense amount (${parsedAmount}) (got ${totalAmount})`
        });
      }

      calculatedShares = shares.map(s => {
        const exactAmt = parseFloat(s.value);
        return {
          userId: parseInt(s.userId, 10),
          shareAmount: exactAmt,
          sharePercentage: (exactAmt / parsedAmount) * 100
        };
      });

    } else if (splitType === 'SHARES') {
      // SHARES (Ratio) Split:
      // Shares contains numerical weights (e.g. Rohan: 2 shares, Priya: 1 share).
      // We split the amount proportionally based on weights.
      if (!shares || shares.length === 0) {
        return res.status(400).json({ error: 'Split details (shares) are required for SHARES split' });
      }

      let totalSharesWeight = 0;
      for (const s of shares) {
        const uId = parseInt(s.userId, 10);
        if (!activeUserIds.includes(uId)) {
          return res.status(400).json({
            error: `Participant (User ID ${uId}) was not active on the expense date.`
          });
        }
        totalSharesWeight += parseFloat(s.value);
      }

      if (totalSharesWeight <= 0) {
        return res.status(400).json({ error: 'Total shares weight must be greater than zero' });
      }

      calculatedShares = shares.map(s => {
        const weight = parseFloat(s.value);
        const pct = (weight / totalSharesWeight) * 100;
        return {
          userId: parseInt(s.userId, 10),
          shareAmount: Math.round((parsedAmount * (weight / totalSharesWeight)) * 100) / 100,
          sharePercentage: pct
        };
      });

      // Adjust rounding discrepancies
      const sumOfShares = calculatedShares.reduce((sum, s) => sum + s.shareAmount, 0);
      const diff = parsedAmount - sumOfShares;
      if (Math.abs(diff) > 0) {
        calculatedShares[calculatedShares.length - 1].shareAmount += diff;
      }
    } else {
      return res.status(400).json({ error: `Unsupported split type: ${splitType}` });
    }

    // Write to database in a safe transaction
    const newExpense = await prisma.$transaction(async (tx) => {
      // Create Expense
      const exp = await tx.expense.create({
        data: {
          groupId: gId,
          description,
          amount: parsedAmount,
          currency: currency || 'INR',
          paidByUserId: payerId,
          expenseDate: expDate,
          splitType,
          transactionType: transactionType || 'EXPENSE'
        }
      });

      // Create Shares
      for (const cs of calculatedShares) {
        await tx.expenseShare.create({
          data: {
            expenseId: exp.id,
            userId: cs.userId,
            shareAmount: cs.shareAmount,
            sharePercentage: cs.sharePercentage
          }
        });
      }

      return exp;
    });

    res.status(201).json(newExpense);
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// 2. Fetch Expenses for Group
export async function getExpenses(req, res) {
  const { groupId } = req.params;
  const gId = parseInt(groupId, 10);

  try {
    const expenses = await prisma.expense.findMany({
      where: { groupId: gId },
      include: {
        shares: {
          include: {
            user: { select: { id: true, name: true } }
          }
        },
        paidByUser: { select: { id: true, name: true } },
        anomalies: true
      },
      orderBy: { expenseDate: 'desc' }
    });

    res.status(200).json(expenses);
  } catch (error) {
    console.error('Fetch expenses error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// 3. View Single Expense Details
export async function getExpenseDetails(req, res) {
  const { id } = req.params;
  const expenseId = parseInt(id, 10);

  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        shares: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        },
        paidByUser: { select: { id: true, name: true, email: true } },
        anomalies: true
      }
    });

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.status(200).json(expense);
  } catch (error) {
    console.error('Fetch expense details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// 4. Edit Expense (Recalculates splits)
export async function editExpense(req, res) {
  const { id } = req.params;
  const {
    description,
    amount,
    currency,
    paidByUserId,
    expenseDate,
    splitType,
    shares,
    transactionType
  } = req.body;

  const expenseId = parseInt(id, 10);
  const payerId = parseInt(paidByUserId, 10);
  const expDate = new Date(expenseDate);
  const parsedAmount = parseFloat(amount);

  try {
    const existingExpense = await prisma.expense.findUnique({
      where: { id: expenseId }
    });

    if (!existingExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const gId = existingExpense.groupId;

    // Validate payer active
    const payerActive = await isMemberActiveOnDate(gId, payerId, expDate);
    if (!payerActive) {
      return res.status(400).json({
        error: `Payer (User ID ${payerId}) was not active on the expense date.`
      });
    }

    const activeUserIds = await getActiveMemberUserIdsOnDate(gId, expDate);
    let calculatedShares = [];

    if (splitType === 'EQUAL') {
      let targetUserIds = [];
      if (shares && shares.length > 0) {
        targetUserIds = shares.map(s => parseInt(s.userId, 10));
      } else {
        targetUserIds = activeUserIds;
      }

      for (const uId of targetUserIds) {
        if (!activeUserIds.includes(uId)) {
          return res.status(400).json({ error: `Participant ID ${uId} was inactive.` });
        }
      }

      const count = targetUserIds.length;
      const shareValue = parsedAmount / count;
      const roundedShare = Math.round(shareValue * 100) / 100;
      let sumOfShares = roundedShare * count;
      let diff = parsedAmount - sumOfShares;

      calculatedShares = targetUserIds.map((uId, idx) => {
        const finalShare = idx === count - 1 ? roundedShare + diff : roundedShare;
        return {
          userId: uId,
          shareAmount: finalShare,
          sharePercentage: 100 / count
        };
      });

    } else if (splitType === 'PERCENTAGE') {
      let totalPct = 0;
      for (const s of shares) {
        const uId = parseInt(s.userId, 10);
        if (!activeUserIds.includes(uId)) {
          return res.status(400).json({ error: `Participant ID ${uId} was inactive.` });
        }
        totalPct += parseFloat(s.value);
      }

      if (Math.abs(totalPct - 100) > 0.01) {
        return res.status(400).json({ error: 'Percentages must total exactly 100%' });
      }

      calculatedShares = shares.map(s => {
        const pct = parseFloat(s.value);
        return {
          userId: parseInt(s.userId, 10),
          shareAmount: Math.round((parsedAmount * (pct / 100)) * 100) / 100,
          sharePercentage: pct
        };
      });

      const sumOfShares = calculatedShares.reduce((sum, s) => sum + s.shareAmount, 0);
      const diff = parsedAmount - sumOfShares;
      if (Math.abs(diff) > 0) {
        calculatedShares[calculatedShares.length - 1].shareAmount += diff;
      }

    } else if (splitType === 'EXACT') {
      let totalAmount = 0;
      for (const s of shares) {
        const uId = parseInt(s.userId, 10);
        if (!activeUserIds.includes(uId)) {
          return res.status(400).json({ error: `Participant ID ${uId} was inactive.` });
        }
        totalAmount += parseFloat(s.value);
      }

      if (Math.abs(totalAmount - parsedAmount) > 0.01) {
        return res.status(400).json({ error: 'Exact amounts must sum up to the expense total.' });
      }

      calculatedShares = shares.map(s => {
        const exactAmt = parseFloat(s.value);
        return {
          userId: parseInt(s.userId, 10),
          shareAmount: exactAmt,
          sharePercentage: (exactAmt / parsedAmount) * 100
        };
      });

    } else if (splitType === 'SHARES') {
      let totalSharesWeight = 0;
      for (const s of shares) {
        const uId = parseInt(s.userId, 10);
        if (!activeUserIds.includes(uId)) {
          return res.status(400).json({ error: `Participant ID ${uId} was inactive.` });
        }
        totalSharesWeight += parseFloat(s.value);
      }

      calculatedShares = shares.map(s => {
        const weight = parseFloat(s.value);
        const pct = (weight / totalSharesWeight) * 100;
        return {
          userId: parseInt(s.userId, 10),
          shareAmount: Math.round((parsedAmount * (weight / totalSharesWeight)) * 100) / 100,
          sharePercentage: pct
        };
      });

      const sumOfShares = calculatedShares.reduce((sum, s) => sum + s.shareAmount, 0);
      const diff = parsedAmount - sumOfShares;
      if (Math.abs(diff) > 0) {
        calculatedShares[calculatedShares.length - 1].shareAmount += diff;
      }
    }

    // Save update inside database transaction
    await prisma.$transaction(async (tx) => {
      // 1. Update Expense
      await tx.expense.update({
        where: { id: expenseId },
        data: {
          description,
          amount: parsedAmount,
          currency: currency || 'INR',
          paidByUserId: payerId,
          expenseDate: expDate,
          splitType,
          transactionType: transactionType || 'EXPENSE',
          needsReview: false // Since manual edit clears review requirements
        }
      });

      // 2. Remove old shares
      await tx.expenseShare.deleteMany({ where: { expenseId } });

      // 3. Create new shares
      for (const cs of calculatedShares) {
        await tx.expenseShare.create({
          data: {
            expenseId,
            userId: cs.userId,
            shareAmount: cs.shareAmount,
            sharePercentage: cs.sharePercentage
          }
        });
      }
    });

    res.status(200).json({ message: 'Expense updated successfully.' });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// 5. Delete Expense
export async function deleteExpense(req, res) {
  const { id } = req.params;
  const expenseId = parseInt(id, 10);

  try {
    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Cascade deletes automatically via constraint or manual deletion
    await prisma.expense.delete({ where: { id: expenseId } });
    res.status(200).json({ message: 'Expense deleted successfully.' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
