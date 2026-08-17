import { Controller, Get, Param, Query } from '@nestjs/common';
import { JudgesService } from './judges.service';

@Controller('judges')
export class JudgesController {
  constructor(private readonly judgesService: JudgesService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.judgesService.search(q ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.judgesService.findOne(id);
  }

  @Get(':id/score')
  getScore(@Param('id') id: string) {
    return this.judgesService.getScore(id);
  }

  @Get(':id/cases')
  getCases(@Param('id') id: string) {
    return this.judgesService.getCases(id);
  }

  @Get(':id/case-types')
  getCaseTypeBreakdown(@Param('id') id: string) {
    return this.judgesService.getCaseTypeBreakdown(id);
  }
}
