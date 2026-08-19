import { Controller, Get } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';

@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @Get('recent')
  async getRecentIntelligence() {
    return this.intelligenceService.getRecentIntelligence();
  }

  @Get('stats')
  async getCoverageStats() {
    return this.intelligenceService.getCoverageStats();
  }

  @Get('feed')
  async getIntelligenceFeed() {
    return this.intelligenceService.getIntelligenceFeed();
  }
}
