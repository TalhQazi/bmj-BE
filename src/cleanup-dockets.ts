import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const allAttorneys = await prisma.attorney.findMany();
  for (const a of allAttorneys) {
    if (/^\d+:\d+-/i.test(a.fullName) || /^\d+-\w+-/i.test(a.fullName)) {
      console.log('Deleting bogus attorney:', a.id, a.fullName);
      // Delete scores and case participants first if any
      await prisma.score.deleteMany({ where: { entityId: a.id } });
      await prisma.caseParticipant.deleteMany({ where: { entityId: a.id } });
      await prisma.attorney.delete({ where: { id: a.id } });
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
