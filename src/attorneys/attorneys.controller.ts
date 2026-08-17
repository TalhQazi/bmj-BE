import { Controller, Get, Param, Query } from '@nestjs/common';
import { AttorneysService } from './attorneys.service';

@Controller('attorneys')
export class AttorneysController {
  constructor(private readonly attorneysService: AttorneysService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.attorneysService.search(q ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.attorneysService.findOne(id);
  }

  @Get(':id/score')
  getScore(@Param('id') id: string) {
    return this.attorneysService.getScore(id);
  }

  @Get(':id/cases')
  getCases(@Param('id') id: string) {
    return this.attorneysService.getCases(id);
  }

  @Get(':id/performance/judges')
  getPerformanceByJudge(@Param('id') id: string) {
    return this.attorneysService.getPerformanceByJudge(id);
  }

  @Get(':id/performance/prosecutors')
  getPerformanceByProsecutor(@Param('id') id: string) {
    return this.attorneysService.getPerformanceByProsecutor(id);
  }

  @Get(':id/performance/case-types')
  getPerformanceByCaseType(@Param('id') id: string) {
    return this.attorneysService.getPerformanceByCaseType(id);
  }
}
