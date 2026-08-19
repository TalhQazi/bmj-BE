import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ScoringModule } from './scoring/scoring.module';
import { AttorneysModule } from './attorneys/attorneys.module';
import { JudgesModule } from './judges/judges.module';
import { ProsecutorsModule } from './prosecutors/prosecutors.module';
import { LegislatorsModule } from './legislators/legislators.module';
import { CasesModule } from './cases/cases.module';
import { SearchModule } from './search/search.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { AuthModule } from './auth/auth.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    PrismaModule,
    ScoringModule,
    AttorneysModule,
    JudgesModule,
    ProsecutorsModule,
    LegislatorsModule,
    CasesModule,
    SearchModule,
    IngestionModule,
    AuthModule,
    IntelligenceModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
