import { Module } from '@nestjs/common';
import { AttorneysController } from './attorneys.controller';
import { AttorneysService } from './attorneys.service';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [ScoringModule],
  controllers: [AttorneysController],
  providers: [AttorneysService],
  exports: [AttorneysService],
})
export class AttorneysModule {}
