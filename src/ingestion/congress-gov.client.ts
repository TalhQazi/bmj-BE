import { Injectable, Logger } from '@nestjs/common';

const BASE_URL = 'https://api.congress.gov/v3';

export interface CongressMemberSummary {
  bioguideId: string;
  /** "Last, First Middle" as returned by the API */
  rawName: string;
  state: string;
  partyName: string;
  district: string | null;
  chamber: 'HOUSE' | 'SENATE' | null;
}

export interface SponsoredBillSummary {
  introducedDate: string;
  type: string;
  congress: number;
  latestActionText: string | null;
  becameLaw: boolean;
}

/**
 * Congress.gov API (api.congress.gov). Free tier allows 5,000 requests/hour —
 * far more generous than CourtListener, so no special throttling is needed here.
 */
@Injectable()
export class CongressGovClient {
  private readonly logger = new Logger(CongressGovClient.name);
  private readonly apiKey = process.env.CONGRESS_GOV_API_KEY;

  private assertConfigured() {
    if (!this.apiKey) {
      throw new Error(
        'CONGRESS_GOV_API_KEY is not set in backend/.env. Get a free key at https://api.congress.gov/sign-up/',
      );
    }
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    this.assertConfigured();
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set('api_key', this.apiKey!);
    url.searchParams.set('format', 'json');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Congress.gov API error ${res.status} on ${path}: ${body.slice(0, 300)}`);
      }
      return res.json() as Promise<T>;
    } catch (e: any) {
      clearTimeout(timer);
      throw e;
    }
  }

  private cachedMembers: { data: CongressMemberSummary[]; timestamp: number } | null = null;

  /** Current members of Congress (House + Senate). */
  async getCurrentMembers(limit = 250): Promise<CongressMemberSummary[]> {
    const now = Date.now();
    if (this.cachedMembers && now - this.cachedMembers.timestamp < 3600_000) {
      return this.cachedMembers.data.slice(0, limit);
    }

    try {
      const data = await this.get<any>('/member', { currentMember: 'true', limit: 250 });
      const members: any[] = data.members ?? [];

      const parsed: CongressMemberSummary[] = members.map((m) => {
        const terms: any[] = m.terms?.item ?? [];
        const latestTerm = terms[terms.length - 1];
        const chamber: 'HOUSE' | 'SENATE' | null =
          latestTerm?.chamber === 'Senate' ? 'SENATE' : latestTerm?.chamber === 'House of Representatives' ? 'HOUSE' : null;

        return {
          bioguideId: m.bioguideId,
          rawName: m.name,
          state: m.state,
          partyName: m.partyName,
          district: m.district != null ? String(m.district) : null,
          chamber,
        };
      });

      this.cachedMembers = { data: parsed, timestamp: now };
      return parsed.slice(0, limit);
    } catch (e: any) {
      this.logger.warn(`Failed to fetch current members from Congress.gov: ${e.message}`);
      return this.cachedMembers?.data.slice(0, limit) ?? [];
    }
  }

  /**
   * A member's sponsored legislation, summarized for LII scoring.
   */
  async getSponsoredLegislation(bioguideId: string, limit = 250): Promise<SponsoredBillSummary[]> {
    const data = await this.get<any>(`/member/${bioguideId}/sponsored-legislation`, { limit });
    const items: any[] = data.sponsoredLegislation ?? [];

    return items.map((item) => ({
      introducedDate: item.introducedDate,
      type: item.type,
      congress: item.congress,
      latestActionText: item.latestAction?.text ?? null,
      becameLaw: /became public law/i.test(item.latestAction?.text ?? ''),
    }));
  }

  /** Converts Congress.gov's "Last, First Middle" name format to "First Middle Last". */
  static formatDisplayName(rawName: string): string {
    const parts = rawName.split(',').map((s) => s.trim());
    if (parts.length !== 2) return rawName;
    return `${parts[1]} ${parts[0]}`;
  }

  /** Search members of Congress by name or state */
  async searchMembers(query: string, limit = 10): Promise<CongressMemberSummary[]> {
    try {
      const all = await this.getCurrentMembers(250);
      const qLower = query.toLowerCase().trim();
      const matched = all.filter((m) => {
        const formatted = CongressGovClient.formatDisplayName(m.rawName).toLowerCase();
        return formatted.includes(qLower) || m.rawName.toLowerCase().includes(qLower) || m.state.toLowerCase().includes(qLower);
      });
      return matched.slice(0, limit);
    } catch (e: any) {
      this.logger.warn(`Failed to search Congress.gov for "${query}": ${e.message}`);
      return [];
    }
  }
}
