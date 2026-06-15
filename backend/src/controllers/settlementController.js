import prisma from '../prisma.js';
import { computeGroupBalances } from '../services/balanceEngine.js';

export async function recordSettlement(req, res) {
  const { groupId } = req.params;
  const { fromUserId, toUserId, amount, settlementDate } = req.body;

  const gId = parseInt(groupId, 10);
  const fromId = parseInt(fromUserId, 10);
  const toId = parseInt(toUserId, 10);
  const parsedAmount = parseFloat(amount);

  try {
    if (isNaN(parsedAmount) || parsedAmount <= 0 || !fromUserId || !toUserId) {
      return res.status(400).json({ error: 'Please provide valid fromUserId, toUserId, and amount.' });
    }

    // Verify members are part of the group
    const members = await prisma.groupMember.findMany({
      where: {
        groupId: gId,
        userId: { in: [fromId, toId] }
      }
    });

    if (members.length < 2 && fromId !== toId) {
      return res.status(400).json({ error: 'One or both users are not members of this group.' });
    }

    const newSettlement = await prisma.settlement.create({
      data: {
        groupId: gId,
        fromUserId: fromId,
        toUserId: toId,
        amount: parsedAmount,
        settlementDate: settlementDate ? new Date(settlementDate) : new Date()
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } }
      }
    });

    res.status(201).json(newSettlement);
  } catch (error) {
    console.error('Record settlement error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getSettlements(req, res) {
  const { groupId } = req.params;
  const gId = parseInt(groupId, 10);

  try {
    const settlements = await prisma.settlement.findMany({
      where: { groupId: gId },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } }
      },
      orderBy: { settlementDate: 'desc' }
    });

    res.status(200).json(settlements);
  } catch (error) {
    console.error('Fetch settlements error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getBalances(req, res) {
  const { groupId } = req.params;
  const gId = parseInt(groupId, 10);

  try {
    const groupExists = await prisma.group.findUnique({ where: { id: gId } });
    if (!groupExists) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const balancesAndSuggestions = await computeGroupBalances(gId);
    res.status(200).json(balancesAndSuggestions);
  } catch (error) {
    console.error('Calculate balances error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
