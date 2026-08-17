import { Module } from '@nestjs/common';
import { ProsecutorsController } from './prosecutors.controller';
import { ProsecutorsService } from './prosecutors.service';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [ScoringModule],
  controllers: [ProsecutorsController],
  providers: [ProsecutorsService],
  exports: [ProsecutorsService],
})
export class ProsecutorsModule {}
