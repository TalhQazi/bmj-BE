import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProsecutorsService } from './prosecutors.service';

@Controller('prosecutors')
export class ProsecutorsController {
  constructor(private readonly prosecutorsService: ProsecutorsService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.prosecutorsService.search(q ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.prosecutorsService.findOne(id);
  }

  @Get(':id/score')
  getScore(@Param('id') id: string) {
    return this.prosecutorsService.getScore(id);
  }

  @Get(':id/cases')
  getCases(@Param('id') id: string) {
    return this.prosecutorsService.getCases(id);
  }
}
