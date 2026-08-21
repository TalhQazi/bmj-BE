const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const pros = await prisma.prosecutor.findMany();
  console.log('Total prosecutors:', pros.length);
  for (const p of pros) {
    const count = await prisma.caseParticipant.count({ where: { entityType: 'PROSECUTOR', entityId: p.id } });
    console.log(p.id, p.fullName, 'Cases:', count);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
