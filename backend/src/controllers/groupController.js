import prisma from '../prisma.js';

export async function getGroups(req, res) {
  try {
    const userId = req.user.id;

    // Get groups where the user is a member
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            members: {
              include: { user: true }
            }
          }
        }
      }
    });

    const groups = memberships.map(m => m.group);
    res.status(200).json(groups);
  } catch (error) {
    console.error('Fetch groups error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getGroupDetails(req, res) {
  const { id } = req.params;
  const groupId = parseInt(id, 10);

  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.status(200).json(group);
  } catch (error) {
    console.error('Fetch group details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createGroup(req, res) {
  const { name } = req.body;
  const userId = req.user.id;

  try {
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Create group and add current user as member
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: { name }
      });

      await tx.groupMember.create({
        data: {
          groupId: g.id,
          userId,
          joinedAt: new Date()
        }
      });

      return g;
    });

    res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function editGroup(req, res) {
  const { id } = req.params;
  const { name } = req.body;
  const groupId = parseInt(id, 10);

  try {
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await prisma.group.update({
      where: { id: groupId },
      data: { name }
    });

    res.status(200).json(group);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function addMember(req, res) {
  const { id } = req.params; // Group ID
  const { userId, email, joinedAt, leftAt } = req.body;
  const groupId = parseInt(id, 10);

  try {
    let targetUserId = userId ? parseInt(userId, 10) : null;

    // If email is provided instead of userId, look up the user
    if (!targetUserId && email) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(404).json({ error: `User with email "${email}" not found.` });
      }
      targetUserId = user.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'Please provide either userId or email.' });
    }

    // Check if membership already exists
    const existing = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: targetUserId }
      }
    });

    if (existing) {
      // If membership exists but was inactive (soft deleted), let's reactivate it or update dates
      const updated = await prisma.groupMember.update({
        where: { id: existing.id },
        data: {
          joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
          leftAt: leftAt ? new Date(leftAt) : null
        }
      });
      return res.status(200).json(updated);
    }

    // Create new membership record
    const member = await prisma.groupMember.create({
      data: {
        groupId,
        userId: targetUserId,
        joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
        leftAt: leftAt ? new Date(leftAt) : null
      }
    });

    res.status(201).json(member);
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function removeMember(req, res) {
  const { id, memberUserId } = req.params; // group_id, user_id
  const { leftAt } = req.body; // Date the member left
  const groupId = parseInt(id, 10);
  const userId = parseInt(memberUserId, 10);

  try {
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    // Update leftAt date (soft-delete / end membership)
    // Respects historical database logic
    const updated = await prisma.groupMember.update({
      where: { id: membership.id },
      data: {
        leftAt: leftAt ? new Date(leftAt) : new Date()
      }
    });

    res.status(200).json({
      message: 'Member membership timeline updated successfully.',
      membership: updated
    });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getMembershipHistory(req, res) {
  const { id } = req.params;
  const groupId = parseInt(id, 10);

  try {
    const history = await prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { joinedAt: 'asc' }
    });

    res.status(200).json(history);
  } catch (error) {
    console.error('Get membership history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
