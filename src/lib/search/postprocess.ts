import { APP_CONFIG } from '@/config/constants';
import { Listing, SearchContext, SearchParams } from '@/types/listing';

export interface PostProcessResult {
  listings: Listing[];
  context: SearchContext;
  notes: string[];
}

const EMPTY_KEY = 'unknown';

export function postProcessListings(
  listings: Listing[],
  params: SearchParams
): PostProcessResult {
  const notes: string[] = [];
  const context: SearchContext = {
    location: params.location,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    hadBudget: Boolean(params.budgetMin || params.budgetMax),
    budgetRelaxed: false,
  };

  const deduped = dedupeListings(listings);
  const valid = deduped.filter(listing => listing.pricePerNight > 0);
  const invalid = deduped.filter(listing => listing.pricePerNight <= 0);
  const maxResults = APP_CONFIG.search.maxResults;

  if (context.hadBudget) {
    const budgetMin = typeof params.budgetMin === 'number' ? params.budgetMin : 0;
    const budgetMaxValue =
      typeof params.budgetMax === 'number' && !Number.isNaN(params.budgetMax)
        ? params.budgetMax
        : null;
    const hasMaxBudget = budgetMaxValue !== null;
    const budgetMax = budgetMaxValue ?? Number.POSITIVE_INFINITY;

    let filtered = valid.filter(listing =>
      listing.pricePerNight >= budgetMin && listing.pricePerNight <= budgetMax
    );

    if (filtered.length < maxResults && hasMaxBudget) {
      const relaxedMax = Math.round(
        budgetMax * (1 + APP_CONFIG.search.budgetRelaxPercent / 100)
      );
      const relaxedFiltered = valid.filter(listing =>
        listing.pricePerNight >= budgetMin && listing.pricePerNight <= relaxedMax
      );

      if (relaxedFiltered.length > filtered.length) {
        filtered = relaxedFiltered;
        context.budgetRelaxed = true;
        notes.push(
          `Relaxed max budget by ${APP_CONFIG.search.budgetRelaxPercent}% to surface more options.`
        );
      }
    }

    const sorted = sortByPriceDesc(filtered);
    const selected = sorted.slice(0, maxResults);

    if (selected.length < maxResults) {
      selected.push(...invalid.slice(0, maxResults - selected.length));
    }

    return {
      listings: selected,
      context,
      notes,
    };
  }

  const sorted = sortByPriceDesc(valid);
  const selected: Listing[] = [];
  const used = new Set<string>();

  const pushUnique = (listing: Listing) => {
    const key = listingKey(listing);
    if (used.has(key)) return;
    used.add(key);
    selected.push(listing);
  };

  const highCount = Math.min(APP_CONFIG.search.highPriceCount, sorted.length);
  for (let i = 0; i < highCount; i += 1) {
    pushUnique(sorted[i]);
  }

  const remaining = sorted.slice(highCount);
  if (remaining.length > 0) {
    const midStart = Math.max(
      0,
      Math.floor((remaining.length - APP_CONFIG.search.midPriceCount) / 2)
    );
    const midSlice = remaining.slice(
      midStart,
      midStart + APP_CONFIG.search.midPriceCount
    );
    midSlice.forEach(pushUnique);
  }

  if (selected.length < maxResults) {
    for (const listing of sorted) {
      if (selected.length >= maxResults) break;
      pushUnique(listing);
    }
  }

  if (selected.length < maxResults) {
    selected.push(...invalid.slice(0, maxResults - selected.length));
  }

  return {
    listings: selected.slice(0, maxResults),
    context,
    notes,
  };
}

function dedupeListings(listings: Listing[]): Listing[] {
  const seen = new Set<string>();
  const result: Listing[] = [];

  for (const listing of listings) {
    const key = listingKey(listing);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(listing);
  }

  return result;
}

function listingKey(listing: Listing): string {
  const urlKey = listing.url?.trim();
  if (urlKey) return urlKey;
  const titleKey = listing.title?.trim().toLowerCase();
  return titleKey || EMPTY_KEY;
}

function sortByPriceDesc(listings: Listing[]): Listing[] {
  return [...listings].sort((a, b) => b.pricePerNight - a.pricePerNight);
}
