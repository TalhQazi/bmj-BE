import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipantType, LegislatorMetric } from '@prisma/client';
import { LEGAL_DISCLAIMER, ScoreResult } from './scoring.types';

/**
 * Scoring Engine
 *
 * Implements the four models exactly as named in the specs:
 *  - API (Attorney Performance Intelligence) — Attorney FULL SPEC, "API™ SCORING ENGINE"
 *  - BJI (Judicial) — FULL Engineering §5, Backend Buildout §17
 *  - PDI (Prosecutorial) — FULL Engineering §5, Backend Buildout §16
 *  - LII (Legislative) — FULL Engineering §5, Backend Buildout §18
 *
 * Simplifications documented inline: opponent_strength_factor and judge_adjustment_factor
 * default to neutral (1.0) until the entity-resolution + cross-referencing layer (Backend
 * Buildout §11) is built to derive them from real opposing-counsel / judge data. Charge-level
 * detail (filed/reduced/dismissed per charge) is approximated from case-level outcome buckets
 * until charge-level ingestion (Backend Buildout §13) lands.
 */
@Injectable()
export class ScoringService {
  private static readonly LAMBDA = 0.0015; // time-decay rate, ~460-day half-life
  private static readonly CONFIDENCE_CAP = 50; // case count at which confidence saturates near 1.0

  constructor(private readonly prisma: PrismaService) {}

  // ---------- shared math helpers ----------

  private zScore(value: number, peerValues: number[]): number {
    if (peerValues.length < 2) return 0;
    const mean = peerValues.reduce((a, b) => a + b, 0) / peerValues.length;
    const variance = peerValues.reduce((a, b) => a + (b - mean) ** 2, 0) / peerValues.length;
    const std = Math.sqrt(variance);
    if (std === 0) return 0;
    const z = (value - mean) / std;
    return Math.max(-3, Math.min(3, z));
  }

  private confidenceFromSampleSize(n: number, cap = ScoringService.CONFIDENCE_CAP): number {
    if (n <= 0) return 0;
    return Math.min(1, Math.log(n + 1) / Math.log(cap + 1));
  }

  private timeDecayWeight(date: Date): number {
    const ageDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    return Math.exp(-ScoringService.LAMBDA * Math.max(0, ageDays));
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private async persistScore(
    entityType: ParticipantType,
    entityId: string,
    scoreType: 'BJI' | 'PDI' | 'API' | 'LII',
    result: ScoreResult,
  ) {
    await this.prisma.score.upsert({
      where: { entityType_entityId_scoreType: { entityType, entityId, scoreType } },
      update: { value: result.value, confidence: result.confidence, sampleSize: result.sampleSize },
      create: {
        entityType,
        entityId,
        scoreType,
        value: result.value,
        confidence: result.confidence,
        sampleSize: result.sampleSize,
      },
    });
  }

  // ---------- API: Attorney Performance Intelligence ----------

  private async attorneyRawScore(attorneyId: string): Promise<{ raw: number; sampleSize: number } | null> {
    const participations = await this.prisma.caseParticipant.findMany({
      where: { entityType: ParticipantType.ATTORNEY, entityId: attorneyId },
      include: { case: { include: { outcome: true } } },
    });
    const usable = participations.filter((p) => p.case.outcome);
    if (usable.length === 0) return null;

    let weightedSum = 0;
    let weightTotal = 0;
    for (const p of usable) {
      const outcomeScore = p.case.outcome!.normalizedOutcome;
      const caseSeverity = p.case.severityScore / 5; // 1..5 -> 0.2..1
      const opponentStrengthFactor = 1; // neutral default, see class docblock
      const judgeAdjustmentFactor = 1; // neutral default, see class docblock
      const raw = outcomeScore * caseSeverity * opponentStrengthFactor * judgeAdjustmentFactor;
      const weight = this.timeDecayWeight(p.case.resolutionDate ?? p.case.filingDate);
      weightedSum += raw * weight;
      weightTotal += weight;
    }
    const raw = weightTotal > 0 ? weightedSum / weightTotal : 0;
    return { raw, sampleSize: usable.length };
  }

  async computeAttorneyScore(attorneyId: string): Promise<ScoreResult> {
    const cached = await this.prisma.score.findFirst({
      where: { entityType: ParticipantType.ATTORNEY, entityId: attorneyId, scoreType: 'API' },
    });
    if (cached) {
      return {
        scoreType: 'API',
        value: this.round2(cached.value),
        confidence: this.round2(cached.confidence),
        sampleSize: cached.sampleSize,
        disclaimer: LEGAL_DISCLAIMER,
      };
    }

    const attorney = await this.prisma.attorney.findUniqueOrThrow({ where: { id: attorneyId } });
    const target = await this.attorneyRawScore(attorneyId);
    if (!target) {
      return { scoreType: 'API', value: 0, confidence: 0, sampleSize: 0, disclaimer: LEGAL_DISCLAIMER };
    }

    const peers = await this.prisma.attorney.findMany({
      where: { jurisdiction: attorney.jurisdiction },
      take: 5,
    });
    const peerResults = await Promise.all(peers.map((p) => this.attorneyRawScore(p.id)));
    const peerRaws = peerResults.filter(Boolean).map((r) => r!.raw);

    const z = this.zScore(target.raw, peerRaws.length > 0 ? peerRaws : [target.raw, 0.5, 0.6]);
    const confidence = this.confidenceFromSampleSize(target.sampleSize);
    const result: ScoreResult = {
      scoreType: 'API',
      value: this.round2(z),
      confidence: this.round2(confidence),
      sampleSize: target.sampleSize,
      disclaimer: LEGAL_DISCLAIMER,
    };
    await this.persistScore(ParticipantType.ATTORNEY, attorneyId, 'API', result);
    return result;
  }

  // ---------- BJI: Judicial ----------

  private async judgeRawScore(judgeId: string): Promise<{ raw: number; sampleSize: number } | null> {
    const participations = await this.prisma.caseParticipant.findMany({
      where: { entityType: ParticipantType.JUDGE, entityId: judgeId },
      include: { case: { include: { outcome: true } } },
    });
    const usable = participations.filter((p) => p.case.outcome);
    if (usable.length === 0) return null;

    let sum = 0;
    for (const p of usable) {
      const outcomeScore = p.case.outcome!.normalizedOutcome;
      const caseSeverity = p.case.severityScore / 5;
      sum += outcomeScore * caseSeverity;
    }
    return { raw: sum / usable.length, sampleSize: usable.length };
  }

  async computeJudgeScore(judgeId: string): Promise<ScoreResult> {
    const cached = await this.prisma.score.findFirst({
      where: { entityType: ParticipantType.JUDGE, entityId: judgeId, scoreType: 'BJI' },
    });
    if (cached) {
      return {
        scoreType: 'BJI',
        value: this.round2(cached.value),
        confidence: this.round2(cached.confidence),
        sampleSize: cached.sampleSize,
        disclaimer: LEGAL_DISCLAIMER,
      };
    }

    const judge = await this.prisma.judge.findUniqueOrThrow({ where: { id: judgeId } });
    const target = await this.judgeRawScore(judgeId);
    if (!target) {
      return { scoreType: 'BJI', value: 0, confidence: 0, sampleSize: 0, disclaimer: LEGAL_DISCLAIMER };
    }

    const peers = await this.prisma.judge.findMany({
      where: { jurisdiction: judge.jurisdiction },
      take: 5,
    });
    const peerResults = await Promise.all(peers.map((p) => this.judgeRawScore(p.id)));
    const peerRaws = peerResults.filter(Boolean).map((r) => r!.raw);

    const z = this.zScore(target.raw, peerRaws.length > 0 ? peerRaws : [target.raw, 0.45, 0.55]);
    const confidence = this.confidenceFromSampleSize(target.sampleSize);
    const result: ScoreResult = {
      scoreType: 'BJI',
      value: this.round2(z),
      confidence: this.round2(confidence),
      sampleSize: target.sampleSize,
      disclaimer: LEGAL_DISCLAIMER,
    };
    await this.persistScore(ParticipantType.JUDGE, judgeId, 'BJI', result);
    return result;
  }

  // ---------- PDI: Prosecutorial ----------

  private async prosecutorRawScore(
    prosecutorId: string,
  ): Promise<{ raw: number; sampleSize: number; convictionEfficiency: number; chargeReductionRate: number; dismissalRatio: number } | null> {
    const participations = await this.prisma.caseParticipant.findMany({
      where: { entityType: ParticipantType.PROSECUTOR, entityId: prosecutorId },
      include: { case: { include: { outcome: true } } },
    });
    const usable = participations.filter((p) => p.case.outcome);
    if (usable.length === 0) return null;

    const total = usable.length;
    const convictions = usable.filter((p) => p.case.outcome!.rawOutcome === 'LOSS' || p.case.outcome!.rawOutcome === 'CONVICTION' || p.case.outcome!.rawOutcome === 'GUILTY_PLEA').length;
    const reductions = usable.filter((p) =>
      ['STANDARD_PLEA', 'PARTIAL_WIN', 'INDICTMENT_UPHELD'].includes(p.case.outcome!.rawOutcome),
    ).length;
    const dismissalsOrAcquittals = usable.filter((p) => p.case.outcome!.rawOutcome === 'WIN' || p.case.outcome!.rawOutcome === 'DISMISSED' || p.case.outcome!.rawOutcome === 'ACQUITTAL').length;

    const convictionEfficiency = convictions / total;
    const chargeReductionRate = reductions / total;
    const dismissalRatio = dismissalsOrAcquittals / total;

    const raw = convictionEfficiency * 1.5 - chargeReductionRate * 0.5 - dismissalRatio * 1.0;
    return { raw, sampleSize: total, convictionEfficiency, chargeReductionRate, dismissalRatio };
  }

  async computeProsecutorScore(prosecutorId: string): Promise<ScoreResult> {
    const cached = await this.prisma.score.findFirst({
      where: { entityType: ParticipantType.PROSECUTOR, entityId: prosecutorId, scoreType: 'PDI' },
    });
    if (cached) {
      return {
        scoreType: 'PDI',
        value: this.round2(cached.value),
        confidence: this.round2(cached.confidence),
        sampleSize: cached.sampleSize,
        disclaimer: LEGAL_DISCLAIMER,
      };
    }

    const prosecutor = await this.prisma.prosecutor.findUniqueOrThrow({ where: { id: prosecutorId } });
    const target = await this.prosecutorRawScore(prosecutorId);
    if (!target) {
      return { scoreType: 'PDI', value: 0, confidence: 0, sampleSize: 0, disclaimer: LEGAL_DISCLAIMER };
    }

    const peers = await this.prisma.prosecutor.findMany({
      where: { jurisdiction: prosecutor.jurisdiction },
      take: 5,
    });
    const peerResults = await Promise.all(peers.map((p) => this.prosecutorRawScore(p.id)));
    const peerRaws = peerResults.filter(Boolean).map((r) => r!.raw);

    const z = this.zScore(target.raw, peerRaws.length > 0 ? peerRaws : [target.raw, 0.4, 0.6]);
    const confidence = this.confidenceFromSampleSize(target.sampleSize);
    const result: ScoreResult = {
      scoreType: 'PDI',
      value: this.round2(z),
      confidence: this.round2(confidence),
      sampleSize: target.sampleSize,
      disclaimer: LEGAL_DISCLAIMER,
    };
    await this.persistScore(ParticipantType.PROSECUTOR, prosecutorId, 'PDI', result);
    return result;
  }

  // ---------- LII: Legislative ----------

  private legislatorRawScore(metrics: LegislatorMetric): number {
    const billSuccessRate = metrics.billsIntroduced > 0 ? metrics.billsPassed / metrics.billsIntroduced : 0;
    return billSuccessRate * 0.4 + metrics.attendanceRate * 0.3 + metrics.districtAlignment * 0.3;
  }

  async computeLegislatorScore(legislatorId: string): Promise<ScoreResult> {
    const legislator = await this.prisma.legislator.findUniqueOrThrow({
      where: { id: legislatorId },
      include: { metrics: true },
    });
    if (!legislator.metrics) {
      return { scoreType: 'LII', value: 0, confidence: 0, sampleSize: 0, disclaimer: LEGAL_DISCLAIMER };
    }

    const targetRaw = this.legislatorRawScore(legislator.metrics);
    const peers = await this.prisma.legislator.findMany({
      where: { chamber: legislator.chamber },
      include: { metrics: true },
    });
    const peerRaws = peers.filter((p) => p.metrics).map((p) => this.legislatorRawScore(p.metrics!));

    const z = this.zScore(targetRaw, peerRaws);
    const sampleSize = legislator.metrics.votesCast;
    const confidence = this.confidenceFromSampleSize(sampleSize, 300);
    const result: ScoreResult = {
      scoreType: 'LII',
      value: this.round2(z),
      confidence: this.round2(confidence),
      sampleSize,
      disclaimer: LEGAL_DISCLAIMER,
    };
    await this.persistScore(ParticipantType.LEGISLATOR, legislatorId, 'LII', result);
    return result;
  }
}
