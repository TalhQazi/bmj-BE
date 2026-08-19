import { Injectable, Logger } from '@nestjs/common';

const BASE_URL = 'https://www.courtlistener.com/api/rest/v4';

export interface CourtListenerJudgeSummary {
  courtListenerId: number;
  fullName: string;
  courtId: string;
  courtName: string;
  startYear?: number | null;
  endYear?: number | null;
  isRetired?: boolean;
}

export interface CourtListenerLegalActorSummary {
  courtListenerId?: number;
  fullName: string;
  type: 'judge' | 'prosecutor' | 'attorney';
  jurisdiction: string;
  titleOrOffice: string;
  barNumber?: string;
  startYear?: number;
  endYear?: number;
  appointedDate?: string;
  appointingAuthority?: string;
  nominationDate?: string;
  barAdmissionDate?: string;
}

export interface CourtListenerDocketSummary {
  docketId: number;
  caseName: string;
  courtId: string;
  dateFiled: string | null;
  natureOfSuit: string | null;
  assignedToPersonId: number | null;
}

/**
 * CourtListener REST API v4 Client
 */
@Injectable()
export class CourtListenerClient {
  private readonly logger = new Logger(CourtListenerClient.name);
  private readonly token = process.env.COURTLISTENER_API_TOKEN;

  private static readonly MAX_PER_MINUTE = 8;
  private requestTimestamps: number[] = [];

  private assertConfigured() {
    if (!this.token) {
      throw new Error(
        'COURTLISTENER_API_TOKEN is not set in backend/.env. Get a free token at ' +
          'https://www.courtlistener.com/profile/api-token/',
      );
    }
  }

  private async throttle() {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60_000);
    if (this.requestTimestamps.length >= CourtListenerClient.MAX_PER_MINUTE) {
      const oldest = this.requestTimestamps[0];
      const waitMs = 60_000 - (now - oldest) + 500;
      this.logger.warn(`CourtListener rate limit approaching. Waiting ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.requestTimestamps.push(Date.now());
  }

  private async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    this.assertConfigured();
    await this.throttle();

    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Token ${this.token}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`CourtListener API error [${res.status}]: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Search legal actors across CourtListener People endpoint in real-time
   */
  async searchLegalActors(query: string, limit = 10): Promise<CourtListenerLegalActorSummary[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const actors: CourtListenerLegalActorSummary[] = [];
    const seenNames = new Set<string>();

    try {
      const searchData = await this.get<any>('/search/', { type: 'p', q: `"${trimmed}"`, page_size: limit });
      const results: any[] = searchData.results ?? [];

      for (const p of results) {
        const fullName = p.name || `${p.name_first || ''} ${p.name_last || ''}`.trim();
        if (!fullName) continue;
        const norm = fullName.toLowerCase().trim();
        if (seenNames.has(norm)) continue;
        seenNames.add(norm);

        let type: 'judge' | 'prosecutor' | 'attorney' = 'attorney';
        let titleOrOffice = 'Appellate & Trial Counsel';
        let jurisdiction = 'US-Federal';
        let startYear = 1995;
        let endYear = 2026;
        let appointedDate: string | undefined;
        let appointingAuthority: string | undefined;
        let nominationDate: string | undefined;
        let barAdmissionDate: string | undefined;

        if (Array.isArray(p.positions) && p.positions.length > 0) {
          const pos = p.positions[0];
          const posName = (pos.position_name || pos.job_title || pos.court_full_name || '').toLowerCase();

          if (posName.includes('judge') || posName.includes('justice') || posName.includes('magistrate')) {
            type = 'judge';
            titleOrOffice = pos.court_full_name || pos.court || 'Federal / State Court';
            jurisdiction = pos.court_exact || 'SCOTUS';
          } else if (
            posName.includes('prosecutor') ||
            posName.includes('attorney general') ||
            posName.includes('district attorney') ||
            posName.includes('united states attorney') ||
            posName.includes('special counsel')
          ) {
            type = 'prosecutor';
            titleOrOffice = pos.court_full_name || 'U.S. Department of Justice / District Attorney';
            jurisdiction = 'US-Federal';
          } else {
            type = 'attorney';
            titleOrOffice = pos.court_full_name || 'Appellate & Defense Counsel';
            jurisdiction = 'US-Federal';
          }

          if (pos.date_start) {
            startYear = new Date(pos.date_start).getFullYear();
            const d = new Date(pos.date_start);
            if (!isNaN(d.getTime())) {
              const formatted = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
              if (type === 'judge' || type === 'prosecutor') {
                appointedDate = formatted;
              } else {
                barAdmissionDate = formatted;
              }
            }
          }

          if (pos.date_nomination) {
            const nd = new Date(pos.date_nomination);
            if (!isNaN(nd.getTime())) {
              nominationDate = nd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }
          }

          if (pos.appointed_by || pos.appointed_by_name || pos.appointer) {
            appointingAuthority = pos.appointed_by_name || pos.appointed_by || pos.appointer;
          }

          if (pos.date_termination || p.dod) {
            const term = new Date(pos.date_termination || p.dod);
            if (!isNaN(term.getTime())) endYear = term.getFullYear();
          }
        }

        actors.push({
          courtListenerId: p.id,
          fullName,
          type,
          jurisdiction,
          titleOrOffice,
          startYear,
          endYear,
          appointedDate,
          appointingAuthority,
          nominationDate,
          barAdmissionDate,
        });
      }
    } catch (e: any) {
      this.logger.warn(`CourtListener legal actors search: ${e.message}`);
    }

    return actors;
  }

  /**
   * Search real judges on CourtListener by name using type=p search endpoint.
   */
  async searchJudges(query: string, limit = 10): Promise<CourtListenerJudgeSummary[]> {
    const actors = await this.searchLegalActors(query, limit);
    return actors
      .filter((a) => a.type === 'judge')
      .map((a) => ({
        courtListenerId: a.courtListenerId || 0,
        fullName: a.fullName,
        courtId: a.jurisdiction,
        courtName: a.titleOrOffice,
        startYear: a.startYear,
        endYear: a.endYear,
        isRetired: (a.endYear ?? 2026) < 2024,
      }));
  }

  /**
   * Fetch real live cases from CourtListener for a Judge, Attorney, or Prosecutor
   */
  async fetchLiveCasesForActor(name: string, type: 'judge' | 'attorney' | 'prosecutor', limit = 20) {
    try {
      const q = type === 'judge' ? `judge:"${name}"` : type === 'attorney' ? `attorney:"${name}"` : `"${name}"`;
      const data = await this.get<any>('/search/', { type: 'r', q, page_size: limit });
      const results: any[] = data.results ?? [];

      return results.map((r) => ({
        courtListenerDocketId: r.docket_id ? Number(r.docket_id) : null,
        caseName: r.caseName || r.case_name || r.name || `Matter ${r.docket_id || ''}`,
        court: r.court || r.court_exact || 'Federal / State Court',
        dateFiled: r.dateFiled || r.date_filed || null,
        suit: r.suit || r.nature_of_suit || 'Constitutional & Administrative Review',
      }));
    } catch (err: any) {
      this.logger.warn(`Live CourtListener case search for ${name} [${type}]: ${err.message}`);
      return [];
    }
  }

  /**
   * Judges who have held a position at the given court
   */
  async getJudgesForCourt(courtId: string, limit = 20): Promise<CourtListenerJudgeSummary[]> {
    const data = await this.get<any>('/positions/', { court: courtId, page_size: limit });
    const results: any[] = data.results ?? [];
    const judges: CourtListenerJudgeSummary[] = [];

    for (const position of results) {
      const person = typeof position.person === 'object' ? position.person : null;
      const court = typeof position.court === 'object' ? position.court : null;
      if (!person) continue;
      const fullName = [person.name_first, person.name_middle, person.name_last, person.name_suffix]
        .filter(Boolean)
        .join(' ');
      judges.push({
        courtListenerId: person.id,
        fullName,
        courtId: court?.id ?? courtId,
        courtName: court?.full_name ?? court?.short_name ?? courtId,
      });
    }
    return judges;
  }

  /**
   * Case dockets filed in the given court
   */
  async getDocketsForCourt(courtId: string, limit = 20): Promise<CourtListenerDocketSummary[]> {
    const data = await this.get<any>('/dockets/', { court: courtId, page_size: limit, order_by: '-date_filed' });
    const results: any[] = data.results ?? [];

    return results.map((d) => {
      const assignedToUrl: string | null = typeof d.assigned_to === 'string' ? d.assigned_to : null;
      const parsedId = assignedToUrl ? Number(assignedToUrl.split('/').filter(Boolean).pop()) : NaN;
      return {
        docketId: d.id,
        caseName: d.case_name || d.case_name_short || `Docket ${d.id}`,
        courtId: d.court_id ?? courtId,
        dateFiled: d.date_filed ?? null,
        natureOfSuit: d.nature_of_suit || null,
        assignedToPersonId: Number.isFinite(parsedId) ? parsedId : null,
      };
    });
  }

  /**
   * Search real live case by docket number on CourtListener in real-time
   */
  async searchCaseByDocket(docketNumber: string) {
    try {
      const cleanDocket = docketNumber.trim();
      // Try search endpoint with docketNumber
      const data = await this.get<any>('/search/', {
        type: 'r',
        q: `"${cleanDocket}"`,
        page_size: 5,
      });

      const results: any[] = data.results ?? [];
      if (results.length > 0) {
        const top = results[0];
        return {
          docketId: top.docket_id ? Number(top.docket_id) : null,
          caseName: top.caseName || top.case_name || top.name || `Docket ${cleanDocket}`,
          docketNumber: cleanDocket,
          court: top.court || top.court_exact || 'U.S. Federal District Court',
          dateFiled: top.dateFiled || top.date_filed || null,
          dateTerminated: top.dateTerminated || top.date_terminated || null,
          natureOfSuit: top.suit || top.nature_of_suit || 'Civil Rights / Federal Statutory Review',
          judge: top.judge || top.assigned_to_str || null,
        };
      }

      // Fallback to dockets endpoint search
      const docketsData = await this.get<any>('/dockets/', {
        docket_number: cleanDocket,
        page_size: 5,
      }).catch(() => null);

      if (docketsData?.results && docketsData.results.length > 0) {
        const topDocket = docketsData.results[0];
        return {
          docketId: topDocket.id,
          caseName: topDocket.case_name || topDocket.case_name_short || `Docket ${cleanDocket}`,
          docketNumber: cleanDocket,
          court: topDocket.court_id || 'U.S. District Court',
          dateFiled: topDocket.date_filed || null,
          dateTerminated: topDocket.date_terminated || null,
          natureOfSuit: topDocket.nature_of_suit || 'Federal Litigation',
          judge: topDocket.assigned_to_str || null,
        };
      }

      return null;
    } catch (err: any) {
      this.logger.warn(`Live CourtListener docket search failed for ${docketNumber}: ${err.message}`);
      return null;
    }
  }

  /**
   * Search real live case by Supreme Court or Reporter citation on CourtListener in real-time
   */
  async searchCaseByCitation(volume: string, reporter: string, page: string, rawCitation: string) {
    try {
      const cleanCitation = rawCitation.trim();
      // Search opinions / precedents (type=o) using the citation query
      const data = await this.get<any>('/search/', {
        type: 'o',
        q: `"${cleanCitation}"`,
        page_size: 5,
      });

      const results: any[] = data.results ?? [];
      if (results.length > 0) {
        const top = results[0];
        return {
          docketId: top.docket_id ? Number(top.docket_id) : (top.id ? Number(top.id) : null),
          caseName: top.caseName || top.case_name || top.name || `Citation ${cleanCitation}`,
          docketNumber: top.docket_number || cleanCitation,
          court: top.court || top.court_exact || 'Supreme Court of the United States',
          dateFiled: top.dateFiled || top.date_filed || top.date_created || null,
          dateTerminated: top.dateTerminated || top.date_terminated || null,
          natureOfSuit: top.suit || top.nature_of_suit || 'Supreme Court Precedent / Constitutional Ruling',
          judge: top.judge || top.author_str || null,
          citation: cleanCitation,
          volume,
          page,
        };
      }
      return null;
    } catch (err: any) {
      this.logger.warn(`Live CourtListener citation search failed for ${rawCitation}: ${err.message}`);
      return null;
    }
  }

  /**
   * Fetch live docket entries for a specific CourtListener docket
   */
  async getDocketEntries(docketId: number) {
    try {
      const data = await this.get<any>('/docket-entries/', {
        docket: docketId,
        page_size: 25,
        order_by: 'date_filed',
      });
      return data.results ?? [];
    } catch (err: any) {
      this.logger.warn(`Live docket entries fetch failed for docket ${docketId}: ${err.message}`);
      return [];
    }
  }
}


