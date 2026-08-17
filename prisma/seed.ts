/**
 * Seed script — populates realistic mock data so every API endpoint and frontend
 * page returns real numbers out of the box. Replace with real connector output
 * once ingestion (backend spec §5-9) is built.
 */
import 'dotenv/config';
import { PrismaClient, ParticipantType, ParticipantRole, Chamber } from '@prisma/client';

const prisma = new PrismaClient();

const JURISDICTIONS = ['CA-Superior', 'NY-Supreme', 'TX-District', 'FL-Circuit', 'IL-Circuit'];
const CASE_TYPES = ['Criminal-Felony', 'Criminal-Misdemeanor', 'Civil-Contract', 'Civil-Tort', 'Family'];
const OUTCOME_BUCKETS = [
  { raw: 'WIN', min: 0.9, max: 1.0 },
  { raw: 'PARTIAL_WIN', min: 0.7, max: 0.85 },
  { raw: 'STANDARD_PLEA', min: 0.5, max: 0.7 },
  { raw: 'SETTLEMENT', min: 0.4, max: 0.7 },
  { raw: 'LOSS', min: 0.0, max: 0.0 },
];

const FIRST_NAMES = ['James', 'Maria', 'Robert', 'Linda', 'Michael', 'Sarah', 'David', 'Jennifer', 'Ahmed', 'Priya'];
const LAST_NAMES = ['Smith', 'Johnson', 'Garcia', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Khan', 'Patel'];
const FIRMS = ['Reardon & Associates', 'Blackstone Legal Group', 'Metro Defense Partners', 'Sterling Law LLC', null];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randFloat(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomName() {
  return `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`;
}
function randomDateWithinYears(years: number) {
  const now = Date.now();
  const past = now - years * 365 * 24 * 60 * 60 * 1000;
  return new Date(past + Math.random() * (now - past));
}

async function main() {
  console.log('Seeding Benchmark Justice mock data...');

  await prisma.score.deleteMany();
  await prisma.caseFeature.deleteMany();
  await prisma.caseOutcome.deleteMany();
  await prisma.caseParticipant.deleteMany();
  await prisma.case.deleteMany();
  await prisma.legislatorMetric.deleteMany();
  await prisma.legislator.deleteMany();
  await prisma.attorney.deleteMany();
  await prisma.judge.deleteMany();
  await prisma.prosecutor.deleteMany();

  // --- Attorneys ---
  const attorneys: { id: string }[] = [];
  for (let i = 0; i < 25; i++) {
    const fullName = randomName();
    const jurisdiction = rand(JURISDICTIONS);
    const a = await prisma.attorney.create({
      data: {
        fullName,
        normalizedName: fullName.toLowerCase().replace(/\s+/g, ' ').trim(),
        barNumber: `BAR${randInt(100000, 999999)}`,
        jurisdiction,
        firmName: rand(FIRMS) ?? undefined,
      },
    });
    attorneys.push(a);
  }

  // --- Judges ---
  const judges: { id: string }[] = [];
  for (let i = 0; i < 15; i++) {
    const fullName = `Hon. ${randomName()}`;
    const jurisdiction = rand(JURISDICTIONS);
    const j = await prisma.judge.create({
      data: {
        fullName,
        normalizedName: fullName.toLowerCase().replace(/\s+/g, ' ').trim(),
        jurisdiction,
        court: `${jurisdiction} Court`,
      },
    });
    judges.push(j);
  }

  // --- Prosecutors ---
  const prosecutors: { id: string }[] = [];
  for (let i = 0; i < 15; i++) {
    const fullName = randomName();
    const jurisdiction = rand(JURISDICTIONS);
    const p = await prisma.prosecutor.create({
      data: {
        fullName,
        normalizedName: fullName.toLowerCase().replace(/\s+/g, ' ').trim(),
        office: `${jurisdiction} District Attorney's Office`,
        jurisdiction,
      },
    });
    prosecutors.push(p);
  }

  // --- Legislators ---
  const legislators: { id: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const fullName = `Rep. ${randomName()}`;
    const billsIntroduced = randInt(5, 40);
    const billsPassed = randInt(0, Math.floor(billsIntroduced * 0.6));
    const votesEligible = randInt(200, 500);
    const votesCast = randInt(Math.floor(votesEligible * 0.7), votesEligible);
    const leg = await prisma.legislator.create({
      data: {
        fullName,
        normalizedName: fullName.toLowerCase().replace(/\s+/g, ' ').trim(),
        chamber: rand([Chamber.HOUSE, Chamber.SENATE]),
        party: rand(['Party A', 'Party B', 'Independent']),
        state: rand(['CA', 'NY', 'TX', 'FL', 'IL']),
        district: `${randInt(1, 40)}`,
        metrics: {
          create: {
            billsSponsored: randInt(1, billsIntroduced),
            billsIntroduced,
            billsPassed,
            votesCast,
            votesEligible,
            attendanceRate: randFloat(0.75, 1.0),
            districtAlignment: randFloat(0.4, 0.95),
          },
        },
      },
    });
    legislators.push(leg);
  }

  // --- Cases + participants + outcomes + features ---
  const NUM_CASES = 300;
  for (let i = 0; i < NUM_CASES; i++) {
    const jurisdiction = rand(JURISDICTIONS);
    const caseType = rand(CASE_TYPES);
    const severityScore = randInt(1, 5);
    const filingDate = randomDateWithinYears(4);
    const resolutionDate = new Date(filingDate.getTime() + randInt(30, 400) * 24 * 60 * 60 * 1000);

    const bucket = rand(OUTCOME_BUCKETS);
    const normalizedOutcome = bucket.raw === 'LOSS' ? 0 : randFloat(bucket.min, bucket.max);

    const c = await prisma.case.create({
      data: {
        jurisdiction,
        caseType,
        severityScore,
        filingDate,
        resolutionDate,
        outcome: {
          create: {
            rawOutcome: bucket.raw,
            normalizedOutcome,
            confidence: randFloat(0.6, 0.99),
          },
        },
        features: {
          create: {
            priorHistoryScore: randFloat(0, 1),
            evidenceWeight: randFloat(0.2, 1),
            pleaFlag: bucket.raw.includes('PLEA'),
          },
        },
      },
    });

    const attorney = rand(attorneys);
    const judge = rand(judges);
    const prosecutor = rand(prosecutors);

    await prisma.caseParticipant.createMany({
      data: [
        {
          caseId: c.id,
          entityType: ParticipantType.ATTORNEY,
          entityId: attorney.id,
          role: ParticipantRole.DEFENSE,
        },
        {
          caseId: c.id,
          entityType: ParticipantType.JUDGE,
          entityId: judge.id,
          role: ParticipantRole.DEFENSE, // judge role placeholder — judges preside, not "sides"
        },
        {
          caseId: c.id,
          entityType: ParticipantType.PROSECUTOR,
          entityId: prosecutor.id,
          role: ParticipantRole.PROSECUTION,
        },
      ],
    });
  }

  console.log(
    `Seeded ${attorneys.length} attorneys, ${judges.length} judges, ${prosecutors.length} prosecutors, ${legislators.length} legislators, ${NUM_CASES} cases.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
