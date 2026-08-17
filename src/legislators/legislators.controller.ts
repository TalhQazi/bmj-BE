import { Controller, Get, Param, Query } from '@nestjs/common';
import { LegislatorsService } from './legislators.service';

@Controller('legislators')
export class LegislatorsController {
  constructor(private readonly legislatorsService: LegislatorsService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.legislatorsService.search(q ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.legislatorsService.findOne(id);
  }

  @Get(':id/score')
  getScore(@Param('id') id: string) {
    return this.legislatorsService.getScore(id);
  }
}
