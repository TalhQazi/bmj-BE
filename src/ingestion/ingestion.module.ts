import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { CongressGovClient } from './congress-gov.client';
import { CourtListenerClient } from './courtlistener.client';

@Module({
  controllers: [IngestionController],
  providers: [IngestionService, CongressGovClient, CourtListenerClient],
  exports: [IngestionService, CongressGovClient, CourtListenerClient],
})
export class IngestionModule {}
