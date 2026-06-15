import prisma from '../prisma.js';

// Helper: Title Case Converter
export function toTitleCase(str) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper: Amount Parser (strips commas, currency symbols)
export function parseAmountString(amountStr) {
  if (amountStr === null || amountStr === undefined || amountStr === '') {
    return { isValid: false, value: 0, hasFormatting: false };
  }
  let cleanStr = String(amountStr).trim();
  const hasFormatting = /[,$\s]/.test(cleanStr);
  cleanStr = cleanStr.replace(/[$,€£\s]/g, '').replace(/,/g, '');
  const val = parseFloat(cleanStr);
  if (isNaN(val)) {
    return { isValid: false, value: 0, hasFormatting };
  }
  return { isValid: true, value: val, hasFormatting };
}

// Helper: Custom Date Parser
export function parseDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return { isValid: false, normalized: null, isAmbiguous: false, needsReview: true, formatNotes: 'Empty date field' };
  }

  const str = dateStr.trim();
  
  // 1. Check YYYY-MM-DD or YYYY/MM/DD
  const isoRegex = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;
  let match = str.match(isoRegex);
  if (match) {
    const [_, y, m, d] = match;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const paddedM = String(month).padStart(2, '0');
      const paddedD = String(day).padStart(2, '0');
      return { 
        isValid: true, 
        normalized: new Date(`${year}-${paddedM}-${paddedD}T12:00:00Z`), 
        isAmbiguous: false, 
        needsReview: false,
        formatNotes: 'ISO Format' 
      };
    }
  }

  // 2. Check DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY or MM-DD-YYYY
  const slashRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
  match = str.match(slashRegex);
  if (match) {
    let [_, p1, p2, y] = match;
    let year = parseInt(y, 10);
    if (y.length === 2) {
      year = 2000 + year; // Assume 2000s
    }
    const val1 = parseInt(p1, 10);
    const val2 = parseInt(p2, 10);

    // Check validity of values
    const isVal1DayOrMonth = val1 >= 1 && val1 <= 31;
    const isVal2DayOrMonth = val2 >= 1 && val2 <= 31;

    if (!isVal1DayOrMonth || !isVal2DayOrMonth) {
      return { isValid: false, normalized: null, isAmbiguous: false, needsReview: true, formatNotes: 'Invalid date values' };
    }

    // Ambiguity Check: Both parts <= 12 means we can't distinguish month from day (e.g. 04/05/2026)
    if (val1 <= 12 && val2 <= 12) {
      // Return a temporary date using MM/DD/YYYY default but flag as ambiguous for manual review
      const paddedM = String(val1).padStart(2, '0');
      const paddedD = String(val2).padStart(2, '0');
      return {
        isValid: true,
        normalized: new Date(`${year}-${paddedM}-${paddedD}T12:00:00Z`),
        isAmbiguous: true,
        needsReview: true,
        formatNotes: `Ambiguous numeric date: ${str}. Prompt manual review.`
      };
    } else if (val1 > 12 && val2 <= 12) {
      // Must be DD/MM/YYYY
      const paddedM = String(val2).padStart(2, '0');
      const paddedD = String(val1).padStart(2, '0');
      return {
        isValid: true,
        normalized: new Date(`${year}-${paddedM}-${paddedD}T12:00:00Z`),
        isAmbiguous: false,
        needsReview: false,
        formatNotes: 'Normalized from DD/MM/YYYY'
      };
    } else if (val1 <= 12 && val2 > 12) {
      // Must be MM/DD/YYYY
      const paddedM = String(val1).padStart(2, '0');
      const paddedD = String(val2).padStart(2, '0');
      return {
        isValid: true,
        normalized: new Date(`${year}-${paddedM}-${paddedD}T12:00:00Z`),
        isAmbiguous: false,
        needsReview: false,
        formatNotes: 'Normalized from MM/DD/YYYY'
      };
    } else {
      // Both parts > 12 (e.g. 15/18/2026) - Invalid date
      return { isValid: false, normalized: null, isAmbiguous: false, needsReview: true, formatNotes: 'Invalid month/day values' };
    }
  }

  // 3. Spelled out months like "Mar 14" or "14 March 2026" or "March 14"
  const months = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  // Format: Month Day Year (e.g. "March 14, 2026", "Mar 14 2026")
  const mdyRegex = /^([a-zA-Z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/;
  match = str.match(mdyRegex);
  if (match) {
    const [_, mName, dVal, yVal] = match;
    const mKey = mName.toLowerCase();
    if (months[mKey]) {
      const month = months[mKey];
      const day = parseInt(dVal, 10);
      const year = yVal ? parseInt(yVal, 10) : 2026; // Default to 2026 for this assignment
      const paddedM = String(month).padStart(2, '0');
      const paddedD = String(day).padStart(2, '0');
      return {
        isValid: true,
        normalized: new Date(`${year}-${paddedM}-${paddedD}T12:00:00Z`),
        isAmbiguous: false,
        needsReview: false,
        formatNotes: yVal ? 'Normalized spelled out date' : 'Normalized spelled out date (year defaulted to 2026)'
      };
    }
  }

  // Format: Day Month Year (e.g. "14 March 2026", "14 Mar")
  const dmyRegex = /^(\d{1,2})\s+([a-zA-Z]+)(?:\s+(\d{4}))?$/;
  match = str.match(dmyRegex);
  if (match) {
    const [_, dVal, mName, yVal] = match;
    const mKey = mName.toLowerCase();
    if (months[mKey]) {
      const month = months[mKey];
      const day = parseInt(dVal, 10);
      const year = yVal ? parseInt(yVal, 10) : 2026; // Default to 2026 for this assignment
      const paddedM = String(month).padStart(2, '0');
      const paddedD = String(day).padStart(2, '0');
      return {
        isValid: true,
        normalized: new Date(`${year}-${paddedM}-${paddedD}T12:00:00Z`),
        isAmbiguous: false,
        needsReview: false,
        formatNotes: yVal ? 'Normalized spelled out date' : 'Normalized spelled out date (year defaulted to 2026)'
      };
    }
  }

  // Fallback: JS Date.parse
  const parsedTime = Date.parse(str);
  if (!isNaN(parsedTime)) {
    const d = new Date(parsedTime);
    return {
      isValid: true,
      normalized: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0)),
      isAmbiguous: false,
      needsReview: false,
      formatNotes: 'Normalized using standard Date parser'
    };
  }

  return { isValid: false, normalized: null, isAmbiguous: false, needsReview: true, formatNotes: 'Unrecognized date format' };
}

// Helper: Parse Split Details (e.g. "Amit: 60, Priya: 30" or "Priya: 500, Rohan: 500")
export function parseSplitDetails(splitDetailsStr) {
  if (!splitDetailsStr || !splitDetailsStr.trim()) return [];
  const parts = splitDetailsStr.split(',').map(s => s.trim());
  const parsed = [];
  for (const part of parts) {
    const match = part.match(/^([^:]+):\s*(\d+(?:\.\d+)?)$/);
    if (match) {
      parsed.push({
        rawName: match[1].trim(),
        value: parseFloat(match[2])
      });
    }
  }
  return parsed;
}

// Main Anomaly Detection and Normalization function
export async function detectAnomalies(row, rowNumber, groupId, batchId, processedRows = []) {
  const anomalies = [];
  let needsReview = false;
  let isWarning = false;

  // Extract raw values
  const rawDate = row.Date || row.date || row.expense_date || '';
  const rawDescription = row.Description || row.description || '';
  const rawPaidBy = row['Paid By'] || row.paid_by || '';
  const rawAmount = row.Amount || row.amount || '';
  const rawCurrency = row.Currency || row.currency || '';
  const rawSplitType = row['Split Type'] || row.split_type || '';
  const rawSplitDetails = row['Split Details'] || row.split_details || '';
  const rawTransactionType = row['Transaction Type'] || row.transaction_type || '';

  // 1. Payer Normalization & Validation
  let paidByUserId = null;
  let originalPayer = rawPaidBy.trim();
  let paidByName = '';

  const dbUsers = await prisma.user.findMany();
  
  if (!originalPayer) {
    anomalies.push({
      anomalyType: 'MISSING_PAYER',
      anomalyDescription: 'The payer field is blank in the import record.',
      actionTaken: 'Flagged for review. Needs manual payer assignment.',
      severity: 'WARNING'
    });
    needsReview = true;
    isWarning = true;
  } else {
    // Look up case-insensitive matching in active db users
    const matchedUser = dbUsers.find(
      u => u.name.toLowerCase() === originalPayer.toLowerCase()
    );

    if (matchedUser) {
      paidByUserId = matchedUser.id;
      paidByName = matchedUser.name;
      if (originalPayer !== matchedUser.name) {
        anomalies.push({
          anomalyType: 'NAME_INCONSISTENCY',
          anomalyDescription: `Payer name "${originalPayer}" has formatting/case issues.`,
          actionTaken: `Normalized from "${originalPayer}" to "${matchedUser.name}".`,
          severity: 'INFO'
        });
      }
    } else {
      anomalies.push({
        anomalyType: 'MISSING_PAYER',
        anomalyDescription: `Payer "${originalPayer}" is not a registered user in the database.`,
        actionTaken: 'Flagged for review. User must map this payer manually.',
        severity: 'WARNING'
      });
      needsReview = true;
      isWarning = true;
    }
  }

  // 2. Currency Normalization
  let currency = rawCurrency.trim().toUpperCase();
  if (!currency) {
    currency = 'INR';
    anomalies.push({
      anomalyType: 'MISSING_CURRENCY',
      anomalyDescription: 'Currency was missing for this transaction.',
      actionTaken: 'Defaulted currency to "INR".',
      severity: 'WARNING'
    });
    isWarning = true;
  } else if (currency !== 'INR' && currency !== 'USD') {
    anomalies.push({
      anomalyType: 'FOREIGN_CURRENCY',
      anomalyDescription: `Unsupported currency "${currency}" detected. Only INR and USD are supported.`,
      actionTaken: 'Flagged for review.',
      severity: 'WARNING'
    });
    needsReview = true;
    isWarning = true;
  } else if (currency === 'USD') {
    anomalies.push({
      anomalyType: 'FOREIGN_CURRENCY',
      anomalyDescription: 'Foreign currency transaction in USD.',
      actionTaken: 'Flagged. Converted using effective exchange rate for balance calculations.',
      severity: 'INFO'
    });
  }

  // 3. Amount Validation & Negative Amount Handling
  let amount = 0;
  let transactionType = rawTransactionType.trim().toUpperCase() || 'EXPENSE';
  
  const amountResult = parseAmountString(rawAmount);
  if (!amountResult.isValid) {
    anomalies.push({
      anomalyType: 'ZERO_AMOUNT', // Or invalid amount
      anomalyDescription: `Invalid numerical amount value: "${rawAmount}".`,
      actionTaken: 'Defaulted amount to 0.00, marked for review.',
      severity: 'WARNING'
    });
    needsReview = true;
    isWarning = true;
  } else {
    amount = amountResult.value;
    if (amountResult.hasFormatting) {
      anomalies.push({
        anomalyType: 'AMOUNT_FORMATTING',
        anomalyDescription: `Amount field contains text formatting characters: "${rawAmount}".`,
        actionTaken: `Cleaned and parsed to raw number ${amount}.`,
        severity: 'INFO'
      });
    }

    if (amount === 0) {
      anomalies.push({
        anomalyType: 'ZERO_AMOUNT',
        anomalyDescription: 'Transaction amount is exactly zero.',
        actionTaken: 'Imported with zero amount; flagged for review.',
        severity: 'WARNING'
      });
      isWarning = true;
    } else if (amount < 0) {
      amount = Math.abs(amount);
      transactionType = 'REFUND';
      anomalies.push({
        anomalyType: 'NEGATIVE_AMOUNT',
        anomalyDescription: `Negative amount detected: "${rawAmount}".`,
        actionTaken: 'Converted amount to positive and updated transaction type to REFUND.',
        severity: 'WARNING'
      });
      isWarning = true;
    }
  }

  // 4. Date Normalization & Ambiguous Dates Check
  let expenseDate = null;
  const dateResult = parseDateString(rawDate);
  if (!dateResult.isValid) {
    anomalies.push({
      anomalyType: 'INVALID_DATE',
      anomalyDescription: `Could not parse date "${rawDate}". Reason: ${dateResult.formatNotes}.`,
      actionTaken: 'Flagged for review. User must input date manually.',
      severity: 'WARNING'
    });
    needsReview = true;
    isWarning = true;
    // Fallback to today's date so database insertion doesn't fail on null constraint
    expenseDate = new Date();
  } else {
    expenseDate = dateResult.normalized;
    if (dateResult.isAmbiguous) {
      anomalies.push({
        anomalyType: 'AMBIGUOUS_DATE',
        anomalyDescription: dateResult.formatNotes,
        actionTaken: 'Flagged for manual review to prevent guessing errors.',
        severity: 'WARNING'
      });
      needsReview = true;
      isWarning = true;
    } else if (dateResult.formatNotes !== 'ISO Format') {
      anomalies.push({
        anomalyType: 'MULTIPLE_DATE_FORMATS',
        anomalyDescription: `Non-standard date format imported: "${rawDate}".`,
        actionTaken: `Parsed and normalized to ISO date: "${expenseDate.toISOString().split('T')[0]}".`,
        severity: 'INFO'
      });
    }
  }

  // 5. Settlement Logged as Expense
  const descLower = rawDescription.toLowerCase();
  const isSettlementKeyword = descLower.includes('paid back') || descLower.includes('settled') || descLower.includes('settlement');
  if (transactionType === 'SETTLEMENT' || isSettlementKeyword) {
    transactionType = 'SETTLEMENT';
    anomalies.push({
      anomalyType: 'SETTLEMENT_TRANSACTION',
      anomalyDescription: `Transaction appears to be a debt settlement: "${rawDescription}".`,
      actionTaken: 'Converted to a Settlement record. Excluded from group expense totals.',
      severity: 'INFO'
    });
  }

  // 6. Split Type Conflicts & Percentage Split Integrity
  let splitType = rawSplitType.trim().toUpperCase() || 'EQUAL';
  const splitDetails = rawSplitDetails.trim();
  const parsedShares = parseSplitDetails(splitDetails);

  if (splitType === 'EQUAL' && splitDetails) {
    anomalies.push({
      anomalyType: 'SPLIT_TYPE_CONFLICT',
      anomalyDescription: 'Equal split type specified but detailed split shares were provided.',
      actionTaken: 'Flagged for review. Defaults to EQUAL split, ignoring splits, or user can change split type.',
      severity: 'WARNING'
    });
    needsReview = true;
    isWarning = true;
  }

  if (splitType !== 'EQUAL' && !splitDetails) {
    anomalies.push({
      anomalyType: 'SPLIT_TYPE_CONFLICT',
      anomalyDescription: `Split type "${splitType}" specified but no split details were provided.`,
      actionTaken: 'Flagged for review. Split details are required for this split type.',
      severity: 'WARNING'
    });
    needsReview = true;
    isWarning = true;
  }

  // Validate Percentage split total
  if (splitType === 'PERCENTAGE' && parsedShares.length > 0) {
    const totalPercentage = parsedShares.reduce((sum, s) => sum + s.value, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      anomalies.push({
        anomalyType: 'INVALID_PERCENTAGE_SPLIT',
        anomalyDescription: `Split percentages sum up to ${totalPercentage}%, which is not equal to 100%.`,
        actionTaken: 'Flagged for review. Must edit split percentages to total exactly 100%.',
        severity: 'WARNING'
      });
      needsReview = true;
      isWarning = true;
    }
  }

  // Validate Exact amount split total
  if (splitType === 'EXACT' && parsedShares.length > 0 && amountResult.isValid) {
    const totalExact = parsedShares.reduce((sum, s) => sum + s.value, 0);
    if (Math.abs(totalExact - amount) > 0.01) {
      anomalies.push({
        anomalyType: 'INVALID_EXACT_SPLIT',
        anomalyDescription: `Exact split amounts sum up to ${totalExact}, but the total expense is ${amount}.`,
        actionTaken: 'Flagged for review. Split amounts must equal the expense total.',
        severity: 'WARNING'
      });
      needsReview = true;
      isWarning = true;
    }
  }

  // 7. Membership Timeline Violations
  // Let's load the group members and check their joinedAt and leftAt ranges relative to expenseDate
  if (groupId && expenseDate) {
    const groupMembers = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true }
    });

    const checkMemberTimeline = (userObj, dateVal) => {
      if (!userObj) return false;
      const jAt = new Date(userObj.joinedAt);
      const lAt = userObj.leftAt ? new Date(userObj.leftAt) : null;
      return dateVal >= jAt && (!lAt || dateVal <= lAt);
    };

    // Check if the payer was active on this date
    if (paidByUserId) {
      const payerMembership = groupMembers.find(gm => gm.userId === paidByUserId);
      if (!payerMembership || !checkMemberTimeline(payerMembership, expenseDate)) {
        anomalies.push({
          anomalyType: 'MEMBERSHIP_TIMELINE_VIOLATION',
          anomalyDescription: `Payer "${paidByName}" was not an active group member on the expense date (${expenseDate.toISOString().split('T')[0]}).`,
          actionTaken: 'Flagged for review. Cannot import expenses paid by inactive members.',
          severity: 'WARNING'
        });
        needsReview = true;
        isWarning = true;
      }
    }

    // Check split details for inactive members
    if (parsedShares.length > 0) {
      for (const share of parsedShares) {
        const matchedMember = groupMembers.find(
          gm => gm.user.name.toLowerCase() === share.rawName.toLowerCase()
        );
        if (matchedMember) {
          if (!checkMemberTimeline(matchedMember, expenseDate)) {
            anomalies.push({
              anomalyType: 'MEMBERSHIP_TIMELINE_VIOLATION',
              anomalyDescription: `Split participant "${matchedMember.user.name}" was not active on the expense date (${expenseDate.toISOString().split('T')[0]}).`,
              actionTaken: 'Flagged for review. Ineligible members will be removed from split on finalization.',
              severity: 'WARNING'
            });
            needsReview = true;
            isWarning = true;
          }
        } else {
          // Participant is not in the group at all
          anomalies.push({
            anomalyType: 'MEMBERSHIP_TIMELINE_VIOLATION',
            anomalyDescription: `Split participant "${share.rawName}" is not a member of the group.`,
            actionTaken: 'Flagged for review.',
            severity: 'WARNING'
          });
          needsReview = true;
          isWarning = true;
        }
      }
    }
  }

  // 8. Duplicate Checks
  // A transaction is a duplicate if there is an identical expense in:
  // - Database
  // - Already processed rows in this batch
  let duplicateFlag = false;

  const checkDuplicateMatch = (e1, e2) => {
    // Check match based on: normalized date, payer, amount, currency, description (lowercase)
    const d1 = new Date(e1.expenseDate).toISOString().split('T')[0];
    const d2 = new Date(e2.expenseDate).toISOString().split('T')[0];
    
    return (
      d1 === d2 &&
      e1.paidByUserId === e2.paidByUserId &&
      parseFloat(e1.amount) === parseFloat(e2.amount) &&
      e1.currency === e2.currency &&
      e1.description.trim().toLowerCase() === e2.description.trim().toLowerCase()
    );
  };

  const checkDuplicateDiffAmount = (e1, e2) => {
    // Check match based on: normalized date, payer, currency, description, but DIFFERENT amount
    const d1 = new Date(e1.expenseDate).toISOString().split('T')[0];
    const d2 = new Date(e2.expenseDate).toISOString().split('T')[0];
    
    return (
      d1 === d2 &&
      e1.paidByUserId === e2.paidByUserId &&
      parseFloat(e1.amount) !== parseFloat(e2.amount) &&
      e1.currency === e2.currency &&
      e1.description.trim().toLowerCase() === e2.description.trim().toLowerCase()
    );
  };

  const currentExpenseObj = {
    expenseDate,
    paidByUserId,
    amount,
    currency,
    description: rawDescription
  };

  // Check database for duplicate
  if (paidByUserId && expenseDate) {
    const dbExpenses = await prisma.expense.findMany({
      where: {
        groupId,
        expenseDate: {
          gte: new Date(expenseDate.toISOString().split('T')[0] + 'T00:00:00.000Z'),
          lte: new Date(expenseDate.toISOString().split('T')[0] + 'T23:59:59.999Z')
        },
        paidByUserId,
        currency,
        description: {
          mode: 'insensitive',
          equals: rawDescription.trim()
        }
      }
    });

    if (dbExpenses.length > 0) {
      duplicateFlag = true;
      anomalies.push({
        anomalyType: 'DUPLICATE_EXPENSE',
        anomalyDescription: `An identical expense already exists in the database.`,
        actionTaken: 'Flagged for review. Never auto-deleted; requires user confirmation.',
        severity: 'WARNING'
      });
      needsReview = true;
      isWarning = true;
    } else {
      // Check database for same transaction with DIFFERENT amount
      const dbDiffAmounts = await prisma.expense.findMany({
        where: {
          groupId,
          expenseDate: {
            gte: new Date(expenseDate.toISOString().split('T')[0] + 'T00:00:00.000Z'),
            lte: new Date(expenseDate.toISOString().split('T')[0] + 'T23:59:59.999Z')
          },
          paidByUserId,
          currency,
          description: {
            mode: 'insensitive',
            equals: rawDescription.trim()
          },
          amount: {
            not: amount
          }
        }
      });

      if (dbDiffAmounts.length > 0) {
        anomalies.push({
          anomalyType: 'DUPLICATE_DIFF_AMOUNT',
          anomalyDescription: `A transaction with identical details but different amount (${dbDiffAmounts[0].amount.toString()} ${currency}) exists in the DB.`,
          actionTaken: 'Flagged for review.',
          severity: 'WARNING'
        });
        needsReview = true;
        isWarning = true;
      }
    }
  }

  // Check batch processed rows for duplicates
  for (const prevRow of processedRows) {
    if (prevRow.paidByUserId && prevRow.expenseDate && paidByUserId && expenseDate) {
      if (checkDuplicateMatch(currentExpenseObj, prevRow)) {
        duplicateFlag = true;
        anomalies.push({
          anomalyType: 'DUPLICATE_EXPENSE',
          anomalyDescription: `An identical expense exists in this import batch (Row ${prevRow.rowNumber}).`,
          actionTaken: 'Flagged for review. Duplicate will not be created without approval.',
          severity: 'WARNING'
        });
        needsReview = true;
        isWarning = true;
      } else if (checkDuplicateDiffAmount(currentExpenseObj, prevRow)) {
        anomalies.push({
          anomalyType: 'DUPLICATE_DIFF_AMOUNT',
          anomalyDescription: `An identical expense with a different amount (${prevRow.amount} ${currency}) exists in this batch (Row ${prevRow.rowNumber}).`,
          actionTaken: 'Flagged for review.',
          severity: 'WARNING'
        });
        needsReview = true;
        isWarning = true;
      }
    }
  }

  return {
    rowNumber,
    rawValues: {
      date: rawDate,
      description: rawDescription,
      paidBy: rawPaidBy,
      amount: rawAmount,
      currency: rawCurrency,
      splitType: rawSplitType,
      splitDetails: rawSplitDetails,
      transactionType: rawTransactionType
    },
    parsedValues: {
      expenseDate,
      description: rawDescription.trim(),
      paidByUserId,
      paidByName,
      amount,
      currency,
      splitType,
      splitDetails,
      transactionType,
      duplicateFlag
    },
    anomalies,
    needsReview,
    isWarning
  };
}
