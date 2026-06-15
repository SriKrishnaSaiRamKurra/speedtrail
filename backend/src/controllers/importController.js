import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import prisma from '../prisma.js';
import { detectAnomalies } from '../services/anomalyService.js';

// Setup file upload folder
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 1. Upload & Process CSV
export async function importCSV(req, res) {
  const { groupId } = req.params;
  const gId = parseInt(groupId, 10);

  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file' });
  }

  const filePath = req.file.path;
  const importId = `import_${Date.now()}`;
  const results = [];

  // Create stream to parse CSV
  fs.createReadStream(filePath)
    .pipe(csvParser())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        const report = {
          importId,
          processedAt: new Date().toISOString(),
          totalRowsProcessed: results.length,
          successfulImports: 0,
          rowsWithWarnings: 0,
          rowsRequiringReview: 0,
          anomalies: []
        };

        const processedRows = []; // Keep track in memory for duplicate detection in this batch

        // We run all database operations in a transaction
        await prisma.$transaction(async (tx) => {
          for (let index = 0; index < results.length; index++) {
            const row = results[index];
            const rowNumber = index + 2; // Row 1 is header

            // Detect anomalies
            const detection = await detectAnomalies(row, rowNumber, gId, importId, processedRows);
            const pValues = detection.parsedValues;

            // Log anomalies to report
            if (detection.anomalies.length > 0) {
              report.anomalies.push(...detection.anomalies.map(a => ({
                rowNumber,
                ...a
              })));
            }

            // Keep track of rows requiring review
            if (detection.needsReview) {
              report.rowsRequiringReview++;
            } else if (detection.isWarning) {
              report.rowsWithWarnings++;
            } else {
              report.successfulImports++;
            }

            // Convert to Settlement if keyword was matched
            if (pValues.transactionType === 'SETTLEMENT') {
              // Extract from/to users
              // In the CSV, settlements are Rohan paid Aisha back, so:
              // Paid By = Rohan, description contains Aisha, or split details list Aisha.
              // Let's deduce target user.
              let toUserId = null;

              // Try parsing target user from description
              const dbUsers = await tx.user.findMany();
              const desc = pValues.description.toLowerCase();
              for (const u of dbUsers) {
                if (u.id !== pValues.paidByUserId && desc.includes(u.name.toLowerCase())) {
                  toUserId = u.id;
                  break;
                }
              }

              // Fallback to split details if description didn't match
              if (!toUserId && pValues.splitDetails) {
                const parts = pValues.splitDetails.split(':');
                if (parts.length > 0) {
                  const matched = dbUsers.find(u => u.name.toLowerCase() === parts[0].trim().toLowerCase());
                  if (matched) toUserId = matched.id;
                }
              }

              // If still unknown, default to another user or first user to avoid null constraints
              if (!toUserId) {
                const otherUser = dbUsers.find(u => u.id !== pValues.paidByUserId);
                toUserId = otherUser ? otherUser.id : pValues.paidByUserId;
              }

              // Create Settlement
              const settlement = await tx.settlement.create({
                data: {
                  groupId: gId,
                  fromUserId: pValues.paidByUserId || dbUsers[0].id,
                  toUserId: toUserId,
                  amount: pValues.amount,
                  settlementDate: pValues.expenseDate || new Date()
                }
              });

              // Save import anomaly logs for this converted settlement
              for (const a of detection.anomalies) {
                await tx.importAnomaly.create({
                  data: {
                    importId,
                    rowNumber,
                    anomalyType: a.anomalyType,
                    anomalyDescription: a.anomalyDescription,
                    actionTaken: a.actionTaken,
                    severity: a.severity
                  }
                });
              }

            } else {
              // Create Expense
              // For Equal Splits, filter out any ineligible members (Meera timeline violation)
              let finalShares = [];
              const groupMembers = await tx.groupMember.findMany({
                where: { groupId: gId },
                include: { user: true }
              });

              const expDate = pValues.expenseDate || new Date();
              const activeMembers = groupMembers.filter(m => {
                const jAt = new Date(m.joinedAt);
                const lAt = m.leftAt ? new Date(m.leftAt) : null;
                return expDate >= jAt && (!lAt || expDate <= lAt);
              });

              const activeUserIds = activeMembers.map(m => m.userId);

              if (pValues.splitType === 'EQUAL') {
                // Determine target active users
                let targetUserIds = [];
                if (pValues.splitDetails) {
                  // Details are provided, parse names
                  const parsedDetails = pValues.splitDetails.split(',').map(s => s.split(':')[0].trim().toLowerCase());
                  const matchedUsers = groupMembers.filter(m => parsedDetails.includes(m.user.name.toLowerCase()));
                  
                  // Filter by membership timeline
                  const eligibleMatchedUsers = matchedUsers.filter(m => activeUserIds.includes(m.userId));
                  targetUserIds = eligibleMatchedUsers.map(m => m.userId);

                  // If timeline violations occurred, document it
                  const violatedCount = matchedUsers.length - eligibleMatchedUsers.length;
                  if (violatedCount > 0) {
                    const violatedNames = matchedUsers
                      .filter(m => !activeUserIds.includes(m.userId))
                      .map(m => m.user.name)
                      .join(', ');
                    
                    const logIndex = detection.anomalies.findIndex(a => a.anomalyType === 'MEMBERSHIP_TIMELINE_VIOLATION');
                    if (logIndex !== -1) {
                      detection.anomalies[logIndex].actionTaken = `Removed inactive members (${violatedNames}) from the split details. Recalculated shares equally among active participants.`;
                    }
                  }
                }

                // Default to all active group members if no details provided or no active members matched details
                if (targetUserIds.length === 0) {
                  targetUserIds = activeUserIds;
                }

                const count = targetUserIds.length;
                const shareValue = count > 0 ? pValues.amount / count : 0.0;
                const roundedShare = Math.round(shareValue * 100) / 100;
                const sumOfShares = roundedShare * count;
                const diff = pValues.amount - sumOfShares;

                finalShares = targetUserIds.map((uId, idx) => ({
                  userId: uId,
                  shareAmount: idx === count - 1 ? roundedShare + diff : roundedShare,
                  sharePercentage: count > 0 ? 100 / count : 0
                }));

              } else {
                // PERCENTAGE, EXACT, or SHARES
                // Parse split details and filter active members
                const parsedSplit = [];
                const parts = pValues.splitDetails ? pValues.splitDetails.split(',') : [];
                
                let sumWeight = 0;
                for (const part of parts) {
                  const subParts = part.split(':');
                  if (subParts.length === 2) {
                    const uName = subParts[0].trim();
                    const val = parseFloat(subParts[1].trim());
                    const uMatch = groupMembers.find(m => m.user.name.toLowerCase() === uName.toLowerCase());
                    
                    if (uMatch && activeUserIds.includes(uMatch.userId)) {
                      parsedSplit.push({ userId: uMatch.userId, value: val });
                      sumWeight += val;
                    }
                  }
                }

                if (pValues.splitType === 'PERCENTAGE' && parsedSplit.length > 0) {
                  finalShares = parsedSplit.map(s => ({
                    userId: s.userId,
                    shareAmount: Math.round((pValues.amount * (s.value / 100)) * 100) / 100,
                    sharePercentage: s.value
                  }));
                  // Rounding correction
                  const sumOfShares = finalShares.reduce((sum, s) => sum + s.shareAmount, 0);
                  const diff = pValues.amount - sumOfShares;
                  if (Math.abs(diff) > 0 && finalShares.length > 0) {
                    finalShares[finalShares.length - 1].shareAmount += diff;
                  }
                } else if (pValues.splitType === 'EXACT' && parsedSplit.length > 0) {
                  finalShares = parsedSplit.map(s => ({
                    userId: s.userId,
                    shareAmount: s.value,
                    sharePercentage: (s.value / pValues.amount) * 100
                  }));
                } else if (pValues.splitType === 'SHARES' && parsedSplit.length > 0) {
                  finalShares = parsedSplit.map(s => ({
                    userId: s.userId,
                    shareAmount: Math.round((pValues.amount * (s.value / sumWeight)) * 100) / 100,
                    sharePercentage: (s.value / sumWeight) * 100
                  }));
                  // Rounding correction
                  const sumOfShares = finalShares.reduce((sum, s) => sum + s.shareAmount, 0);
                  const diff = pValues.amount - sumOfShares;
                  if (Math.abs(diff) > 0 && finalShares.length > 0) {
                    finalShares[finalShares.length - 1].shareAmount += diff;
                  }
                }
              }

              // Create the Expense
              const dbExpense = await tx.expense.create({
                data: {
                  groupId: gId,
                  description: pValues.description,
                  amount: pValues.amount,
                  currency: pValues.currency,
                  paidByUserId: pValues.paidByUserId || groupMembers[0].userId, // fallback
                  expenseDate: expDate,
                  splitType: pValues.splitType,
                  transactionType: pValues.transactionType,
                  importId,
                  rowNumber,
                  originalPayer: pValues.paidByName || originalPayer,
                  needsReview: detection.needsReview,
                  duplicateFlag: pValues.duplicateFlag
                }
              });

              // Create Expense Shares
              for (const fs of finalShares) {
                await tx.expenseShare.create({
                  data: {
                    expenseId: dbExpense.id,
                    userId: fs.userId,
                    shareAmount: fs.shareAmount,
                    sharePercentage: fs.sharePercentage
                  }
                });
              }

              // Save import anomalies associated with this expense
              for (const a of detection.anomalies) {
                await tx.importAnomaly.create({
                  data: {
                    importId,
                    rowNumber,
                    anomalyType: a.anomalyType,
                    anomalyDescription: a.anomalyDescription,
                    actionTaken: a.actionTaken,
                    severity: a.severity,
                    expenseId: dbExpense.id
                  }
                });
              }
            }

            // Add to batch tracking
            processedRows.push({
              rowNumber,
              paidByUserId: pValues.paidByUserId,
              expenseDate: pValues.expenseDate,
              amount: pValues.amount,
              currency: pValues.currency,
              description: pValues.description
            });
          }
        });

        // Clean up temporary uploaded file
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.error('Failed to clean up uploaded file:', unlinkErr);
        }

        res.status(200).json(report);
      } catch (error) {
        // Clean up temporary uploaded file
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.error('Failed to clean up uploaded file in error handler:', unlinkErr);
        }

        console.error('CSV processing transaction error:', error);
        res.status(500).json({ error: 'Import failed due to a database transaction error.' });
      }
    })
    .on('error', (error) => {
      console.error('CSV parsing stream error:', error);
      res.status(500).json({ error: 'Failed to read the uploaded CSV file.' });
    });
}

// 2. Fetch Import Anomalies Report
export async function getImportReport(req, res) {
  const { importId } = req.params;

  try {
    const anomalies = await prisma.importAnomaly.findMany({
      where: { importId },
      include: {
        expense: {
          select: {
            id: true,
            description: true,
            amount: true,
            currency: true,
            originalPayer: true,
            needsReview: true,
            duplicateFlag: true
          }
        }
      },
      orderBy: { rowNumber: 'asc' }
    });

    if (anomalies.length === 0) {
      return res.status(404).json({ error: 'Import report not found or had no anomalies.' });
    }

    res.status(200).json({
      importId,
      anomalies
    });
  } catch (error) {
    console.error('Fetch import report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Helper to check if a user was active on a given date inside a Prisma instance or transaction
async function checkMemberActiveOnDate(prismaInstance, groupId, userId, date) {
  const membership = await prismaInstance.groupMember.findFirst({
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

// 3. Resolve Import Anomaly / Confirm Duplicate / Approve row
export async function resolveAnomaly(req, res) {
  const { anomalyId } = req.params;
  const { action, correctedValue } = req.body; // action: 'APPROVE', 'CORRECT_DATE', 'CORRECT_PAYER', 'RESOLVE_SPLITS'

  const aId = parseInt(anomalyId, 10);

  try {
    const anomaly = await prisma.importAnomaly.findUnique({
      where: { id: aId },
      include: {
        expense: {
          include: {
            shares: true
          }
        }
      }
    });

    if (!anomaly) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    if (!anomaly.expenseId || !anomaly.expense) {
      // Settlement or unlinked anomaly
      await prisma.importAnomaly.update({
        where: { id: aId },
        data: { resolved: true }
      });
      return res.status(200).json({ message: 'Anomaly resolved successfully' });
    }

    const expense = anomaly.expense;
    const expenseId = expense.id;

    // Timeline validations before running transaction
    if (action === 'CORRECT_DATE') {
      const correctDate = new Date(correctedValue);
      if (isNaN(correctDate.getTime())) {
        return res.status(400).json({ error: 'Please provide a valid ISO date.' });
      }

      // Check if payer is active on corrected date
      const payerActive = await checkMemberActiveOnDate(prisma, expense.groupId, expense.paidByUserId, correctDate);
      if (!payerActive) {
        return res.status(400).json({
          error: `Payer (User ID ${expense.paidByUserId}) was not an active member on the corrected date (${correctedValue.split('T')[0]}).`
        });
      }

      // Check if all split participants are active on corrected date
      for (const share of expense.shares) {
        const active = await checkMemberActiveOnDate(prisma, expense.groupId, share.userId, correctDate);
        if (!active) {
          return res.status(400).json({
            error: `Split participant (User ID ${share.userId}) was not an active member on the corrected date (${correctedValue.split('T')[0]}).`
          });
        }
      }

    } else if (action === 'CORRECT_PAYER') {
      const payerId = parseInt(correctedValue, 10);
      if (isNaN(payerId)) {
        return res.status(400).json({ error: 'Please provide a valid payer user ID.' });
      }

      // Check if corrected payer is active on expense date
      const payerActive = await checkMemberActiveOnDate(prisma, expense.groupId, payerId, new Date(expense.expenseDate));
      if (!payerActive) {
        return res.status(400).json({
          error: `Selected payer (User ID ${payerId}) was not an active member on the expense date (${expense.expenseDate.toISOString().split('T')[0]}).`
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (action === 'APPROVE') {
        // Confirm duplicate or approve warning - simply clears need_review
        await tx.expense.update({
          where: { id: expenseId },
          data: {
            needsReview: false,
            duplicateFlag: false
          }
        });

      } else if (action === 'CORRECT_DATE') {
        const correctDate = new Date(correctedValue);
        await tx.expense.update({
          where: { id: expenseId },
          data: {
            expenseDate: correctDate,
            needsReview: false
          }
        });

      } else if (action === 'CORRECT_PAYER') {
        const payerId = parseInt(correctedValue, 10);
        await tx.expense.update({
          where: { id: expenseId },
          data: {
            paidByUserId: payerId,
            needsReview: false
          }
        });
      }

      // Mark the anomaly as resolved in database
      await tx.importAnomaly.update({
        where: { id: aId },
        data: { resolved: true }
      });
    });

    res.status(200).json({ message: 'Anomaly resolved successfully.' });
  } catch (error) {
    console.error('Resolve anomaly error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
