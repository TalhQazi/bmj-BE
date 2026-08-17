require('dotenv').config();
const { PrismaClient, ParticipantType, ParticipantRole } = require('@prisma/client');
const { randomUUID } = require('crypto');

const dbUrl = process.env.DATABASE_URL || "postgresql://postgres.pzeddaoljbjzpuxrtzdk:Auh2004%403222@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl }
  }
});

const CASE_TYPES = [
  'Civil-Contract',
  'Civil-Tort',
  'Civil-Rights',
  'Criminal-Felony',
  'Criminal-Misdemeanor',
  'Appellate-Constitutional',
  'Corporate-Securities',
  'Labor-Employment',
  'Environmental-Regulatory',
  'Intellectual-Property'
];

const OUTCOMES = ['WIN', 'LOSS', 'PARTIAL_WIN', 'SETTLEMENT', 'STANDARD_PLEA'];
const OUTCOME_SCORES = {
  WIN: 0.92,
  PARTIAL_WIN: 0.72,
  SETTLEMENT: 0.55,
  STANDARD_PLEA: 0.52,
  LOSS: 0.05,
};

function randomDate(startYear, endYear) {
  const year = Math.floor(Math.random() * (endYear - startYear + 1)) + startYear;
  const month = Math.floor(Math.random() * 12);
  const day = Math.floor(Math.random() * 28) + 1;
  const filing = new Date(year, month, day);
  const resolutionDays = Math.floor(Math.random() * 240) + 30;
  const resolution = new Date(filing.getTime() + resolutionDays * 24 * 60 * 60 * 1000);
  return { filing, resolution };
}

const JUDGE_START_YEARS = {
  'clarence thomas': 1991,
  'ruth bader ginsburg': 1993,
  'stephen breyer': 1994,
  'john roberts': 2005,
  'samuel alito': 2006,
  'sonia sotomayor': 2009,
  'elena kagan': 2010,
  'neil gorsuch': 2017,
  'brett kavanaugh': 2018,
  'amy coney barrett': 2020,
  'ketanji brown jackson': 2022,
};

async function main() {
  console.log('Connecting to database...');
  await prisma.$connect();
  console.log('Connected successfully!');

  const judges = await prisma.judge.findMany();
  const attorneys = await prisma.attorney.findMany();
  const prosecutors = await prisma.prosecutor.findMany();
  const legislators = await prisma.legislator.findMany();

  console.log(`Found ${judges.length} judges, ${attorneys.length} attorneys, ${prosecutors.length} prosecutors, ${legislators.length} legislators.`);

  let totalCasesCreated = 0;

  for (const judge of judges) {
    const norm = (judge.normalizedName || judge.fullName).toLowerCase().trim();
    let startYear = 1990;
    for (const [nameKey, yr] of Object.entries(JUDGE_START_YEARS)) {
      if (norm.includes(nameKey)) {
        startYear = yr;
        break;
      }
    }

    const currentCasesCount = await prisma.caseParticipant.count({
      where: { entityType: ParticipantType.JUDGE, entityId: judge.id }
    });

    const targetCasesCount = Math.max(50, (2026 - startYear) * 2 + 15);
    const neededCases = targetCasesCount - currentCasesCount;

    if (neededCases > 0) {
      console.log(`Populating ${neededCases} historical cases (1990–2026) for Judge: ${judge.fullName} (Start: ${startYear})...`);

      const casesToCreate = [];
      const participantsToCreate = [];
      const outcomesToCreate = [];
      const featuresToCreate = [];

      for (let i = 0; i < neededCases; i++) {
        const caseId = randomUUID();
        const { filing, resolution } = randomDate(startYear, 2026);
        const caseType = CASE_TYPES[Math.floor(Math.random() * CASE_TYPES.length)];
        const severityScore = Math.floor(Math.random() * 5) + 1;
        const outcome = OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)];
        const normalized = OUTCOME_SCORES[outcome];

        casesToCreate.push({
          id: caseId,
          jurisdiction: judge.jurisdiction || judge.court || 'SCOTUS',
          caseType,
          severityScore,
          filingDate: filing,
          resolutionDate: resolution,
        });

        participantsToCreate.push({
          id: randomUUID(),
          caseId,
          entityType: ParticipantType.JUDGE,
          entityId: judge.id,
          role: ParticipantRole.DEFENSE,
        });

        const attorney = attorneys[Math.floor(Math.random() * attorneys.length)];
        participantsToCreate.push({
          id: randomUUID(),
          caseId,
          entityType: ParticipantType.ATTORNEY,
          entityId: attorney.id,
          role: ParticipantRole.DEFENSE,
        });

        const prosecutor = prosecutors[Math.floor(Math.random() * prosecutors.length)];
        participantsToCreate.push({
          id: randomUUID(),
          caseId,
          entityType: ParticipantType.PROSECUTOR,
          entityId: prosecutor.id,
          role: ParticipantRole.PROSECUTION,
        });

        outcomesToCreate.push({
          id: randomUUID(),
          caseId,
          rawOutcome: outcome,
          normalizedOutcome: normalized,
          confidence: +(0.80 + Math.random() * 0.18).toFixed(2),
        });

        featuresToCreate.push({
          caseId,
          priorHistoryScore: +(Math.random() * 0.8).toFixed(2),
          evidenceWeight: +(0.4 + Math.random() * 0.5).toFixed(2),
          pleaFlag: outcome === 'STANDARD_PLEA',
        });
      }

      await prisma.case.createMany({ data: casesToCreate, skipDuplicates: true });
      await prisma.caseParticipant.createMany({ data: participantsToCreate, skipDuplicates: true });
      await prisma.caseOutcome.createMany({ data: outcomesToCreate, skipDuplicates: true });
      await prisma.caseFeature.createMany({ data: featuresToCreate, skipDuplicates: true });

      totalCasesCreated += neededCases;
    }
  }

  console.log(`Created ${totalCasesCreated} multi-decade cases spanning 1990–2026 across judges!`);

  console.log('--- Updating Multi-Decade (1990–2026) Legislative Output Metrics ---');
  for (const leg of legislators) {
    const isSenior = leg.fullName.toLowerCase().includes('pelosi') || 
                     leg.fullName.toLowerCase().includes('sanders') || 
                     leg.fullName.toLowerCase().includes('mcconnell') ||
                     leg.fullName.toLowerCase().includes('schumer') ||
                     leg.fullName.toLowerCase().includes('durbin');

    const yearsInOffice = isSenior ? 36 : Math.floor(Math.random() * 18) + 6;
    const billsSponsored = Math.floor(yearsInOffice * (Math.random() * 12 + 6));
    const billsIntroduced = billsSponsored + Math.floor(yearsInOffice * (Math.random() * 20 + 10));
    const billsPassed = Math.max(5, Math.floor(billsSponsored * (Math.random() * 0.15 + 0.08)));
    const votesCast = Math.floor(yearsInOffice * 450 * (Math.random() * 0.06 + 0.92));
    const votesEligible = Math.floor(votesCast / (Math.random() * 0.04 + 0.94));
    const attendanceRate = +(votesCast / votesEligible).toFixed(2);
    const districtAlignment = +(0.72 + Math.random() * 0.22).toFixed(2);

    await prisma.legislatorMetric.upsert({
      where: { legislatorId: leg.id },
      update: {
        billsSponsored,
        billsIntroduced,
        billsPassed,
        votesCast,
        votesEligible,
        attendanceRate,
        districtAlignment,
      },
      create: {
        legislatorId: leg.id,
        billsSponsored,
        billsIntroduced,
        billsPassed,
        votesCast,
        votesEligible,
        attendanceRate,
        districtAlignment,
      }
    });
  }

  console.log('Multi-decade legislative metrics successfully updated for all members!');
  console.log('=== MULTI-DECADE DATA POPULATION COMPLETE ===');
}

main()
  .catch(err => {
    console.error('Error populating multi-decade data:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
