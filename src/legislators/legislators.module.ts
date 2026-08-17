import { Module } from '@nestjs/common';
import { LegislatorsController } from './legislators.controller';
import { LegislatorsService } from './legislators.service';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [ScoringModule],
  controllers: [LegislatorsController],
  providers: [LegislatorsService],
  exports: [LegislatorsService],
})
export class LegislatorsModule {}
