import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CongressGovClient } from './congress-gov.client';
import { CourtListenerClient } from './courtlistener.client';
import { Chamber, ParticipantRole, ParticipantType } from '@prisma/client';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly congress: CongressGovClient,
    private readonly courtListener: CourtListenerClient,
  ) {}

  /**
   * Real ingestion: current members of Congress + their sponsored-legislation counts.
   * Upserts on bioguideId, so re-running is safe and idempotent.
   *
   * NOT yet populated (documented gap, not fabricated): attendanceRate, districtAlignment,
   * votesCast/votesEligible. Congress.gov's API doesn't expose per-member roll-call vote
   * aggregates directly — that needs a separate connector (e.g. house.gov/senate.gov
   * roll-call XML, or GovTrack). Left at 0 rather than invented.
   */
  async ingestLegislatorsFromCongressGov(limit: number) {
    const members = await this.congress.getCurrentMembers(limit);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const m of members) {
      if (!m.chamber) {
        skipped++;
        continue;
      }

      const bills = await this.congress.getSponsoredLegislation(m.bioguideId);
      const billsSponsored = bills.length;
      const billsPassed = bills.filter((b) => b.becameLaw).length;
      const fullName = CongressGovClient.formatDisplayName(m.rawName);

      const existing = await this.prisma.legislator.findUnique({ where: { bioguideId: m.bioguideId } });

      const legislator = await this.prisma.legislator.upsert({
        where: { bioguideId: m.bioguideId },
        update: {
          fullName,
          normalizedName: fullName.toLowerCase(),
          chamber: m.chamber as Chamber,
          party: m.partyName,
          state: m.state,
          district: m.district,
        },
        create: {
          bioguideId: m.bioguideId,
          fullName,
          normalizedName: fullName.toLowerCase(),
          chamber: m.chamber as Chamber,
          party: m.partyName,
          state: m.state,
          district: m.district,
        },
      });

      await this.prisma.legislatorMetric.upsert({
        where: { legislatorId: legislator.id },
        update: { billsSponsored, billsIntroduced: billsSponsored, billsPassed },
        create: {
          legislatorId: legislator.id,
          billsSponsored,
          billsIntroduced: billsSponsored,
          billsPassed,
          votesCast: 0,
          votesEligible: 0,
          attendanceRate: 0,
          districtAlignment: 0,
        },
      });

      existing ? updated++ : created++;
    }

    return { source: 'congress.gov', membersProcessed: members.length, created, updated, skipped };
  }

  /**
   * Real ingestion: judges who have held a position at the given court.
   * Upserts on courtListenerId, so re-running is safe.
   */
  async ingestJudgesFromCourtListener(courtId: string, limit: number) {
    const judges = await this.courtListener.getJudgesForCourt(courtId, limit);
    let created = 0;
    let updated = 0;

    for (const j of judges) {
      const existing = await this.prisma.judge.findUnique({ where: { courtListenerId: j.courtListenerId } });
      await this.prisma.judge.upsert({
        where: { courtListenerId: j.courtListenerId },
        update: { fullName: j.fullName, normalizedName: j.fullName.toLowerCase(), jurisdiction: j.courtName, court: j.courtName },
        create: {
          courtListenerId: j.courtListenerId,
          fullName: j.fullName,
          normalizedName: j.fullName.toLowerCase(),
          jurisdiction: j.courtName,
          court: j.courtName,
        },
      });
      existing ? updated++ : created++;
    }

    return { source: 'courtlistener', court: courtId, judgesProcessed: judges.length, created, updated };
  }

  /**
   * Real ingestion: case dockets for the given court. Populates Case rows and links
   * the presiding judge as a participant when that judge has already been ingested
   * (run judges/courtlistener for the same court first).
   *
   * Deliberately does NOT create a CaseOutcome — free-tier docket data doesn't reliably
   * expose disposition/outcome, and this platform does not fabricate outcomes. The
   * existing scoring engine already skips cases with no outcome, so these cases simply
   * won't count toward BJI until real outcome data is added.
   */
  async ingestCasesFromCourtListener(courtId: string, limit: number) {
    const dockets = await this.courtListener.getDocketsForCourt(courtId, limit);
    let created = 0;
    let skippedExisting = 0;
    let linkedToJudge = 0;

    for (const d of dockets) {
      const existing = await this.prisma.case.findUnique({ where: { courtListenerDocketId: d.docketId } });
      if (existing) {
        skippedExisting++;
        continue;
      }

      const newCase = await this.prisma.case.create({
        data: {
          courtListenerDocketId: d.docketId,
          jurisdiction: d.courtId,
          caseType: d.natureOfSuit || 'Federal Docket (Unclassified)',
          severityScore: 3, // neutral default — real severity needs charge/claim-level detail
          filingDate: d.dateFiled ? new Date(d.dateFiled) : new Date(),
        },
      });
      created++;

      if (d.assignedToPersonId) {
        const judge = await this.prisma.judge.findUnique({ where: { courtListenerId: d.assignedToPersonId } });
        if (judge) {
          await this.prisma.caseParticipant.create({
            data: {
              caseId: newCase.id,
              entityType: ParticipantType.JUDGE,
              entityId: judge.id,
              role: ParticipantRole.DEFENSE, // judges preside, not "sides" — placeholder per schema convention
            },
          });
          linkedToJudge++;
        }
      }
    }

    return { source: 'courtlistener', court: courtId, docketsProcessed: dockets.length, created, skippedExisting, linkedToJudge };
  }
}
