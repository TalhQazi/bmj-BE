import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('intelligence')
  getIntelligence() {
    return this.searchService.getIntelligence();
  }

  @Get()
  search(@Query('q') q: string) {
    return this.searchService.searchAll(q ?? '');
  }
}
