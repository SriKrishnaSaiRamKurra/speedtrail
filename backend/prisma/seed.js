import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Clear existing data
  await prisma.exchangeRate.deleteMany({});
  await prisma.importAnomaly.deleteMany({});
  await prisma.settlement.deleteMany({});
  await prisma.expenseShare.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.groupMember.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Cleaned up existing records.');

  // 2. Hash standard password
  const passwordHash = await bcrypt.hash('password123', 10);

  // 3. Create Users
  const usersData = [
    { name: 'Aisha', email: 'aisha@flatmates.com' },
    { name: 'Rohan', email: 'rohan@flatmates.com' },
    { name: 'Priya', email: 'priya@flatmates.com' },
    { name: 'Meera', email: 'meera@flatmates.com' },
    { name: 'Sam', email: 'sam@flatmates.com' },
    { name: 'Dev', email: 'dev@flatmates.com' },
  ];

  const createdUsers = {};
  for (const u of usersData) {
    const user = await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash,
      },
    });
    createdUsers[u.name.toLowerCase()] = user;
    console.log(`Created User: ${user.name}`);
  }

  // 4. Create Group
  const group = await prisma.group.create({
    data: {
      name: 'Flatmates Shared Expenses',
    },
  });
  console.log(`Created Group: ${group.name}`);

  // 5. Create Group Memberships with historical timelines
  // Rules:
  // - Aisha, Rohan, Priya: Joined Jan 1, 2026, never left.
  // - Meera: Joined Jan 1, 2026, left end of March (March 31, 2026).
  // - Sam: Joined mid-April (April 15, 2026), never left.
  // - Dev: Joined only for a trip (May 15, 2026 to May 25, 2026).
  
  const memberships = [
    { name: 'Aisha', joinedAt: new Date('2026-01-01T00:00:00Z'), leftAt: null },
    { name: 'Rohan', joinedAt: new Date('2026-01-01T00:00:00Z'), leftAt: null },
    { name: 'Priya', joinedAt: new Date('2026-01-01T00:00:00Z'), leftAt: null },
    { name: 'Meera', joinedAt: new Date('2026-01-01T00:00:00Z'), leftAt: new Date('2026-03-31T23:59:59Z') },
    { name: 'Sam', joinedAt: new Date('2026-04-15T00:00:00Z'), leftAt: null },
    { name: 'Dev', joinedAt: new Date('2026-05-15T00:00:00Z'), leftAt: new Date('2026-05-25T23:59:59Z') },
  ];

  for (const m of memberships) {
    const user = createdUsers[m.name.toLowerCase()];
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: user.id,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
      },
    });
    console.log(
      `Added Member: ${user.name} (Joined: ${m.joinedAt.toISOString().split('T')[0]}, Left: ${
        m.leftAt ? m.leftAt.toISOString().split('T')[0] : 'Active'
      })`
    );
  }

  // 6. Create Exchange Rates (USD to INR)
  const exchangeRates = [
    { fromCurrency: 'USD', toCurrency: 'INR', rate: 83.50, effectiveDate: new Date('2026-01-01T00:00:00Z') },
    { fromCurrency: 'USD', toCurrency: 'INR', rate: 83.65, effectiveDate: new Date('2026-02-01T00:00:00Z') },
    { fromCurrency: 'USD', toCurrency: 'INR', rate: 83.80, effectiveDate: new Date('2026-03-01T00:00:00Z') },
    { fromCurrency: 'USD', toCurrency: 'INR', rate: 83.90, effectiveDate: new Date('2026-04-01T00:00:00Z') },
    { fromCurrency: 'USD', toCurrency: 'INR', rate: 84.10, effectiveDate: new Date('2026-05-01T00:00:00Z') },
    { fromCurrency: 'USD', toCurrency: 'INR', rate: 84.05, effectiveDate: new Date('2026-06-01T00:00:00Z') },
  ];

  for (const er of exchangeRates) {
    await prisma.exchangeRate.create({
      data: er,
    });
  }
  console.log('Exchange rates populated.');

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
