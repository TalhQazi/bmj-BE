import { Controller, Get, Param } from '@nestjs/common';
import { CasesService } from './cases.service';

@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.casesService.findOne(id);
  }
}
