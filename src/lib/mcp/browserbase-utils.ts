import { Listing, ListingDetail, Review } from '@/types/listing';

export function parseListings(content: unknown, currency: string): Listing[] {
  const listings: Listing[] = [];

  try {
    const data = Array.isArray(content) ? content : [content];

    for (const item of data) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title : '';
      const priceRaw = resolveListingPrice(record);
      const url = typeof record.url === 'string' ? normalizeUrl(record.url) : '';
      const imageUrl = typeof record.imageUrl === 'string' ? record.imageUrl : null;
      if (title && priceRaw) {
        listings.push({
          title,
          pricePerNight: parsePrice(priceRaw),
          currency,
          rating: toNumberValue(record.rating),
          reviewCount: toIntegerValue(record.reviewCount),
          reviewSummary: null,
          url,
          imageUrl
        });
      }
    }
  } catch (error) {
    console.error('Failed to parse listings:', error);
  }

  return listings;
}

export function parseListingDetail(content: unknown, url: string): ListingDetail {
  const record = content && typeof content === 'object' ? (content as Record<string, unknown>) : {};
  const reviews: Review[] = [];

  const rawReviews = Array.isArray(record.reviews) ? record.reviews : [];
  for (const review of rawReviews.slice(0, 15)) {
    if (!review || typeof review !== 'object') continue;
    const reviewRecord = review as Record<string, unknown>;
    reviews.push({
      author: typeof reviewRecord.author === 'string' ? reviewRecord.author : 'Anonymous',
      date: typeof reviewRecord.date === 'string' ? reviewRecord.date : new Date().toISOString(),
      text: typeof reviewRecord.text === 'string' ? reviewRecord.text : ''
    });
  }

  const currency = typeof record.currency === 'string'
    ? record.currency
    : typeof record.priceCurrency === 'string'
      ? record.priceCurrency
      : 'USD';
  const imageUrl = typeof record.imageUrl === 'string' ? record.imageUrl : null;
  const description = typeof record.description === 'string' ? record.description : undefined;
  const priceValue = record.price !== undefined
    ? toStringValue(record.price)
    : record.pricePerNight !== undefined
      ? toStringValue(record.pricePerNight)
      : '';

  return {
    title: typeof record.title === 'string' ? record.title : '',
    pricePerNight: priceValue ? parsePrice(priceValue) : 0,
    currency,
    rating: toNumberValue(record.rating),
    reviewCount: toIntegerValue(record.reviewCount),
    reviewSummary: null,
    reviews,
    url,
    imageUrl,
    description
  };
}

export function extractToolText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const texts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const record = part as Record<string, unknown>;
    if (record.type === 'text' && typeof record.text === 'string') {
      texts.push(record.text);
      continue;
    }
    if (record.type === 'resource' && record.resource && typeof record.resource === 'object') {
      const resource = record.resource as Record<string, unknown>;
      if (typeof resource.text === 'string') {
        texts.push(resource.text);
      }
    }
  }
  return texts.join(' ').trim();
}

function parsePrice(priceStr: string): number {
  const match = priceStr.match(/[\d,]+/);
  return match ? parseInt(match[0].replace(/,/g, '')) : 0;
}

function resolveListingPrice(record: Record<string, unknown>): string {
  if ('price' in record) return toStringValue(record.price);
  if ('pricePerNight' in record) return toStringValue(record.pricePerNight);
  if ('priceText' in record) return toStringValue(record.priceText);
  if ('pricePerNightText' in record) return toStringValue(record.pricePerNightText);
  return '';
}

function normalizeUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://www.airbnb.com${url.startsWith('/') ? '' : '/'}${url}`;
}

function toStringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  return '';
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function toIntegerValue(value: unknown): number | null {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
