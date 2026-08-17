import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { IngestionModule } from '../ingestion/ingestion.module';
import { JudgesModule } from '../judges/judges.module';
import { LegislatorsModule } from '../legislators/legislators.module';
import { AttorneysModule } from '../attorneys/attorneys.module';
import { ProsecutorsModule } from '../prosecutors/prosecutors.module';

@Module({
  imports: [
    IngestionModule,
    JudgesModule,
    LegislatorsModule,
    AttorneysModule,
    ProsecutorsModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
