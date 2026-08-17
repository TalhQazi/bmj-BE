import { BadRequestException, Controller, Post, Query } from '@nestjs/common';
import { IngestionService } from './ingestion.service';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * POST /ingestion/legislators/congress?limit=20
   * Pulls current members of Congress + sponsored-legislation counts from Congress.gov.
   */
  @Post('legislators/congress')
  ingestLegislators(@Query('limit') limit?: string) {
    return this.ingestionService.ingestLegislatorsFromCongressGov(limit ? Number(limit) : 20);
  }

  /**
   * POST /ingestion/judges/courtlistener?court=scotus&limit=20
   * Pulls real judges for a court from CourtListener. Court IDs are listed at
   * https://www.courtlistener.com/help/api/jurisdictions/ (e.g. "scotus", "ca9", "dcd").
   */
  @Post('judges/courtlistener')
  ingestJudges(@Query('court') court: string, @Query('limit') limit?: string) {
    if (!court) throw new BadRequestException('Query param "court" is required, e.g. ?court=scotus');
    return this.ingestionService.ingestJudgesFromCourtListener(court, limit ? Number(limit) : 20);
  }

  /**
   * POST /ingestion/cases/courtlistener?court=scotus&limit=20
   * Pulls real case dockets for a court from CourtListener. Run judges/courtlistener
   * for the same court first so presiding judges can be linked as participants.
   */
  @Post('cases/courtlistener')
  ingestCases(@Query('court') court: string, @Query('limit') limit?: string) {
    if (!court) throw new BadRequestException('Query param "court" is required, e.g. ?court=scotus');
    return this.ingestionService.ingestCasesFromCourtListener(court, limit ? Number(limit) : 20);
  }
}
