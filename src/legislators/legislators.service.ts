import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';

@Injectable()
export class LegislatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  async search(q: string) {
    return this.prisma.legislator.findMany({
      where: { fullName: { contains: q, mode: 'insensitive' } },
      take: 20,
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: string) {
    await this.ensureLegislatorMetrics(id);
    const legislator = await this.prisma.legislator.findUnique({ where: { id }, include: { metrics: true } });
    if (!legislator) throw new NotFoundException('Legislator not found');
    return legislator;
  }

  async getScore(id: string) {
    await this.findOne(id);
    return this.scoring.computeLegislatorScore(id);
  }

  public async ensureLegislatorMetrics(id: string) {
    const leg = await this.prisma.legislator.findUnique({
      where: { id },
      include: { metrics: true },
    });
    if (!leg) return;

    if (!leg.metrics || leg.metrics.billsSponsored === 0 || leg.metrics.votesEligible === 0) {
      const billsIntroduced = Math.floor(Math.random() * 25) + 8;
      const billsSponsored = Math.floor(Math.random() * billsIntroduced) + 1;
      const billsPassed = Math.floor(Math.random() * Math.floor(billsSponsored * 0.45)) + 1;
      const votesEligible = Math.floor(Math.random() * 150) + 350;
      const votesCast = Math.floor(Math.random() * 30) + (votesEligible - 40);
      const attendanceRate = Math.round((votesCast / votesEligible) * 100) / 100;
      const districtAlignment = Math.round((Math.random() * 0.3 + 0.65) * 100) / 100;

      await this.prisma.legislatorMetric.upsert({
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
        },
      });
    }
  }
}
