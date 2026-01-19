// Playwright MCP Adapter Implementation (HTTP/SSE client)

import { MCPAdapter } from '@/types/mcp';
import { SearchParams, Listing, ListingDetail } from '@/types/listing';
import { logger } from '@/lib/utils/logger';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

interface PlaywrightMcpConfig {
  url: string;
  timeout: number;
}

type PlaywrightMcpTransport = StreamableHTTPClientTransport | SSEClientTransport;

const extractListingsFromDom = async () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    const target = Math.min(document.body.scrollHeight, window.innerHeight * 2);
    let scrolled = 0;
    while (scrolled < target) {
      window.scrollBy(0, 400);
      scrolled += 400;
      await delay(150);
    }
    window.scrollTo(0, 0);
  } catch {
    // Ignore scroll errors
  }

  await delay(500);

  const cards = Array.from(document.querySelectorAll('[data-testid="card-container"]')).slice(0, 10);
  return cards.map((card) => {
    const title = card.querySelector('[data-testid="listing-card-title"]')?.textContent?.trim()
      || card.querySelector('[id^="title_"]')?.textContent?.trim()
      || '';

    const price = card.querySelector('[data-testid="price-availability-row"]')?.textContent?.trim()
      || card.querySelector('span[class*="_1y74zjx"]')?.textContent?.trim()
      || '';

    const linkElement = card.querySelector('a[href*="/rooms/"]');
    const link = linkElement?.getAttribute('href') || '';

    const rating = card.querySelector('[aria-label*="rating"]')?.textContent?.trim()
      || card.querySelector('span[role="img"]')?.getAttribute('aria-label')?.trim()
      || '';

    const imageElement = card.querySelector('img[src*="airbnb"]');
    const imageUrl = imageElement?.getAttribute('src') || '';

    return {
      title,
      price,
      rating,
      url: link,
      imageUrl
    };
  });
};

const extractListingDetailFromDom = () => {
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  const getText = (selector: string) => {
    const el = document.querySelector(selector);
    return el ? normalize(el.textContent || '') : '';
  };
  const getMeta = (name: string) => {
    const el = document.querySelector(`meta[property="${name}"]`)
      || document.querySelector(`meta[name="${name}"]`);
    return el ? normalize(el.getAttribute('content') || '') : '';
  };
  const extractNumber = (value: string) => {
    const match = value.replace(/,/g, '').match(/\d+(\.\d+)?/);
    return match ? Number(match[0]) : null;
  };

  const bodyText = document.body?.innerText || '';
  const textSample = normalize(bodyText).slice(0, 8000);
  const combined = (document.title + ' ' + textSample).toLowerCase();
  const signals: string[] = [];
  if (combined.includes('captcha') || combined.includes('recaptcha')) signals.push('captcha');
  if (combined.includes('access denied') || combined.includes('request blocked') || combined.includes('forbidden')) {
    signals.push('access_denied');
  }
  if (combined.includes('unusual traffic') || combined.includes('automated') || combined.includes('robot')) {
    signals.push('bot_check');
  }
  if (combined.includes('verify you are') || combined.includes('confirm you are') || combined.includes('human')) {
    signals.push('verification');
  }
  if (document.querySelector('iframe[src*="captcha"], iframe[title*="captcha" i]')) {
    signals.push('captcha_frame');
  }
  if (document.querySelector('input[name*="captcha" i], #captcha, [id*="captcha" i]')) {
    signals.push('captcha_input');
  }

  const priceCandidates = [
    getText('[data-testid="book-it-price"]'),
    getText('[data-testid="price"]'),
    getText('[data-testid="book-it-default-price"]'),
    getText('[data-testid="price-and-discounted-price"]'),
    getText('[data-testid="book-it-price-availability-row"]')
  ];
  const priceText = priceCandidates.find(Boolean) || '';
  const metaPrice = getMeta('og:price:amount') || getMeta('price');
  const metaCurrency = getMeta('og:price:currency') || getMeta('price:currency');

  const ratingCandidates = [
    getText('[data-testid="review-score"]'),
    getText('[data-testid="listing-rating"]'),
    normalize(document.querySelector('[aria-label*="rating" i]')?.getAttribute('aria-label') || '')
  ];
  const ratingText = ratingCandidates.find(Boolean) || '';
  const reviewCountCandidates = [
    getText('[data-testid="review-count"]'),
    getText('[data-testid="reviews-count"]'),
    normalize(document.querySelector('a[href*="#reviews"]')?.textContent || ''),
    normalize(document.querySelector('[aria-label*="reviews" i]')?.getAttribute('aria-label') || '')
  ];
  const reviewCountText = reviewCountCandidates.find(Boolean) || '';

  const structuredData: Array<Record<string, unknown>> = [];
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    const text = script.textContent;
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') structuredData.push(item as Record<string, unknown>);
        }
      } else if (parsed && typeof parsed === 'object') {
        structuredData.push(parsed as Record<string, unknown>);
      }
    } catch {
      // ignore parse errors
    }
  }

  let structuredTitle = '';
  let structuredImage = '';
  let structuredDescription = '';
  let structuredRating: number | null = null;
  let structuredReviewCount: number | null = null;
  let structuredPrice = '';
  let structuredCurrency = '';
  const structuredReviews: Array<{ text: string; author?: string; date?: string; rating?: number }> = [];

  for (const item of structuredData) {
    if (!structuredTitle && typeof item.name === 'string') structuredTitle = item.name;
    if (!structuredDescription && typeof item.description === 'string') structuredDescription = item.description;
    if (!structuredImage && typeof item.image === 'string') structuredImage = item.image;
    if (!structuredImage && Array.isArray(item.image) && typeof item.image[0] === 'string') {
      structuredImage = item.image[0];
    }
    const aggregateRating = item.aggregateRating as Record<string, unknown> | undefined;
    if (aggregateRating) {
      if (structuredRating === null && aggregateRating.ratingValue !== undefined) {
        structuredRating = Number(aggregateRating.ratingValue);
      }
      if (structuredReviewCount === null && aggregateRating.reviewCount !== undefined) {
        structuredReviewCount = Number(aggregateRating.reviewCount);
      }
    }
    const offers = item.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (offer && typeof offer === 'object') {
      if (!structuredPrice && offer.price !== undefined) structuredPrice = String(offer.price);
      if (!structuredCurrency && typeof offer.priceCurrency === 'string') {
        structuredCurrency = offer.priceCurrency;
      }
    }
    const review = item.review as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const reviewList = Array.isArray(review) ? review : review ? [review] : [];
    for (const entry of reviewList) {
      const text = typeof entry.reviewBody === 'string'
        ? entry.reviewBody
        : typeof entry.description === 'string'
          ? entry.description
          : '';
      if (!text) continue;
      const authorValue = entry.author;
      let author = '';
      if (typeof authorValue === 'string') {
        author = authorValue;
      } else if (authorValue && typeof authorValue === 'object') {
        const authorRecord = authorValue as Record<string, unknown>;
        if (typeof authorRecord.name === 'string') author = authorRecord.name;
      }
      const date = typeof entry.datePublished === 'string' ? entry.datePublished : '';
      const reviewRating = entry.reviewRating as Record<string, unknown> | undefined;
      const rating = reviewRating && reviewRating.ratingValue !== undefined
        ? Number(reviewRating.ratingValue)
        : undefined;
      structuredReviews.push({
        text: normalize(text),
        author: author || undefined,
        date: date || undefined,
        rating
      });
    }
  }

  const title = getText('h1') || structuredTitle || getMeta('og:title');
  const description = getText('[data-testid="listing-description"]')
    || structuredDescription
    || getMeta('og:description')
    || getMeta('description');
  const metaImage = getMeta('og:image') || getMeta('twitter:image');
  const domImage = document.querySelector('img[src*="muscache.com"], img[src*="airbnb"], img[src*="airbnbusercontent"]')
    ?.getAttribute('src') || '';
  const imageUrl = metaImage || structuredImage || domImage;

  const images = Array.from(document.images || []);
  const imageCount = images.length;
  const loadedImageCount = images.filter(img => img.complete && img.naturalWidth > 0).length;

  const ratingValue = structuredRating ?? extractNumber(ratingText);
  const reviewCountValue = structuredReviewCount ?? (reviewCountText ? extractNumber(reviewCountText) : null);

  return {
    title: title || '',
    description,
    priceText,
    metaPrice,
    priceCurrency: structuredCurrency,
    metaCurrency,
    structuredPrice,
    ratingText,
    ratingValue,
    reviewCountText,
    reviewCountValue,
    imageUrl,
    reviews: structuredReviews,
    signals,
    pageTitle: document.title || '',
    imageCount,
    loadedImageCount
  };
};

export class PlaywrightMcpAdapter implements MCPAdapter {
  readonly name = 'playwright-mcp' as const;
  private client: Client | null = null;
  private transport: PlaywrightMcpTransport | null = null;
  private config: PlaywrightMcpConfig;
  private connected = false;
  private screenshotCallback?: (base64: string) => void;

  constructor(config: PlaywrightMcpConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (!this.config.url) {
      throw new Error('Playwright MCP URL is required');
    }

    const baseUrl = new URL(this.config.url);
    this.client = new Client(
      {
        name: 'airbnb-search-agent',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    try {
      logger.info('mcp', 'playwright_mcp_connecting', { url: baseUrl.toString(), transport: 'streamable-http' });
      this.transport = new StreamableHTTPClientTransport(baseUrl);
      await this.client.connect(this.transport);
      this.connected = true;
      logger.info('mcp', 'playwright_mcp_connected', { url: baseUrl.toString(), transport: 'streamable-http' });
      return;
    } catch (error) {
      logger.warn('mcp', 'playwright_mcp_streamable_failed', {
        url: baseUrl.toString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      const sseUrl = new URL(baseUrl.toString());
      sseUrl.pathname = sseUrl.pathname.endsWith('/sse')
        ? sseUrl.pathname
        : `${sseUrl.pathname.replace(/\/$/, '')}/sse`;

      logger.info('mcp', 'playwright_mcp_connecting', { url: sseUrl.toString(), transport: 'sse' });
      this.transport = new SSEClientTransport(sseUrl);
      await this.client.connect(this.transport);
      this.connected = true;
      logger.info('mcp', 'playwright_mcp_connected', { url: sseUrl.toString(), transport: 'sse' });
    } catch (error) {
      this.connected = false;
      const message = error instanceof Error ? error.message : String(error);
      logger.error('mcp', 'playwright_mcp_connect_failed', { error: message });
      throw new Error(`Failed to connect to Playwright MCP: ${message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.client?.close();
    } finally {
      this.transport = null;
      this.client = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.connected || !this.client) return false;
    try {
      const tools = await this.client.listTools();
      return Boolean(tools?.tools?.length);
    } catch {
      return false;
    }
  }

  setScreenshotCallback(callback: (base64: string) => void): void {
    this.screenshotCallback = callback;
  }

  async takeScreenshot(): Promise<string | null> {
    if (!this.client || !this.connected) return null;

    const result = await this.callTool(
      'browser_take_screenshot',
      { fullPage: true },
      'Take screenshot'
    );
    const image = extractImageData(result.content);
    if (!image) return null;

    if (this.screenshotCallback) {
      this.screenshotCallback(image);
      return null;
    }
    return image;
  }

  async searchAirbnb(params: SearchParams): Promise<Listing[]> {
    if (!this.client || !this.connected) {
      throw new Error('Playwright MCP adapter not connected');
    }

    try {
      logger.info('mcp', 'playwright_mcp_search_start', { location: params.location });

      const searchUrl = this.buildSearchUrl(params);
      await this.callTool('browser_navigate', { url: searchUrl }, 'Navigate to search');

      await this.runCode(
        [
          `try { await page.waitForLoadState('domcontentloaded', { timeout: ${Math.min(this.config.timeout, 15000)} }); } catch (e) {}`,
          `try { await page.waitForSelector('[data-testid="card-container"], a[href*="/rooms/"]', { timeout: ${Math.min(this.config.timeout, 15000)} }); } catch (e) {}`,
          'await page.waitForTimeout(1200);'
        ].join('\n'),
        'Warm search page'
      );

      const rawListings = await this.evaluate<unknown[]>(
        extractListingsFromDom.toString(),
        'Extract listings'
      );

      return this.parseListings(rawListings, params.currency || 'USD').slice(0, 10);
    } catch (error) {
      logger.error('mcp', 'playwright_mcp_search_failed', { error: String(error) });
      throw error;
    }
  }

  async getListingDetails(url: string): Promise<ListingDetail> {
    if (!this.client || !this.connected) {
      throw new Error('Playwright MCP adapter not connected');
    }

    logger.info('mcp', 'playwright_mcp_detail_start', { url });

    await this.callTool('browser_navigate', { url }, 'Navigate to listing');

    await this.runCode(
      [
        `try { await page.waitForLoadState('networkidle', { timeout: ${Math.min(this.config.timeout, 15000)} }); } catch (e) {}`,
        'await page.waitForTimeout(800);',
        'await page.evaluate(() => window.scrollBy(0, 600));',
        'await page.waitForTimeout(800);',
        'await page.evaluate(() => window.scrollBy(0, 600));',
        'await page.waitForTimeout(800);'
      ].join('\n'),
      'Warm detail page'
    );

    let details: {
      title: string;
      description: string;
      priceText: string;
      metaPrice: string;
      priceCurrency: string;
      metaCurrency: string;
      structuredPrice: string;
      ratingText: string;
      ratingValue: number | null;
      reviewCountText: string;
      reviewCountValue: number | null;
      imageUrl: string;
      reviews: Array<{ text: string; author?: string; date?: string; rating?: number }>;
      signals: string[];
      pageTitle: string;
      imageCount: number;
      loadedImageCount: number;
    };

    try {
      details = await this.evaluate<typeof details>(
        extractListingDetailFromDom.toString(),
        'Extract listing details'
      );
    } catch (error) {
      logger.error('mcp', 'playwright_mcp_detail_extract_failed', {
        url,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    if (details.signals.length > 0) {
      logger.warn('mcp', 'playwright_mcp_detail_antibot', {
        url,
        signals: details.signals,
        pageTitle: details.pageTitle
      });
    }

    const priceSource = details.priceText || details.metaPrice || details.structuredPrice;
    const pricePerNight = priceSource ? this.parsePrice(priceSource) : 0;
    const currency = details.priceCurrency || details.metaCurrency || 'USD';
    const rating = details.ratingValue ?? (details.ratingText ? this.parseRatingValue(details.ratingText) : null);
    const reviewCount = details.reviewCountValue
      ?? (details.reviewCountText ? this.parseCountValue(details.reviewCountText) : null);
    const reviews = Array.isArray(details.reviews)
      ? details.reviews.filter(review => review.text).slice(0, 10).map(review => ({
          text: review.text,
          author: review.author,
          date: review.date,
          rating: review.rating
        }))
      : [];

    const listingDetail: ListingDetail = {
      title: details.title,
      pricePerNight,
      currency,
      rating,
      reviewCount,
      reviewSummary: null,
      reviews,
      url,
      imageUrl: details.imageUrl || null,
      description: details.description || undefined
    };

    if (!listingDetail.title && !listingDetail.imageUrl && !listingDetail.pricePerNight) {
      logger.warn('mcp', 'playwright_mcp_detail_sparse', {
        url,
        pageTitle: details.pageTitle,
        imageCount: details.imageCount,
        loadedImageCount: details.loadedImageCount
      });
    }

    logger.info('mcp', 'playwright_mcp_detail_extracted', {
      url,
      title: listingDetail.title,
      pricePerNight: listingDetail.pricePerNight,
      currency: listingDetail.currency,
      rating: listingDetail.rating,
      reviewCount: listingDetail.reviewCount,
      imageFound: Boolean(listingDetail.imageUrl),
      reviews: listingDetail.reviews.length
    });

    return listingDetail;
  }

  async getMultipleListingDetails(urls: string[]): Promise<ListingDetail[]> {
    const results: ListingDetail[] = [];
    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index];
      try {
        logger.info('mcp', 'playwright_mcp_detail_fetch', {
          url,
          index: index + 1,
          total: urls.length
        });
        results.push(await this.getListingDetails(url));
      } catch (error) {
        logger.warn('mcp', 'playwright_mcp_detail_failed', {
          url,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return results;
  }

  private async callTool<TArgs extends Record<string, unknown>>(
    name: string,
    args: TArgs,
    action: string
  ): Promise<{ content?: unknown; isError?: boolean }> {
    if (!this.client) throw new Error('Playwright MCP client not connected');
    const result = await this.client.callTool({ name, arguments: args as Record<string, unknown> });
    if (result?.isError) {
      const detail = extractToolText(result.content);
      throw new Error(detail ? `${action} failed: ${detail}` : `${action} failed`);
    }
    return {
      content: result.content,
      isError: result.isError === true,
    };
  }

  private async runCode(code: string, action: string): Promise<void> {
    await this.callTool('browser_run_code', { code }, action);
  }

  private async evaluate<T>(fnSource: string, action: string): Promise<T> {
    const result = await this.callTool('browser_evaluate', { function: fnSource }, action);
    const text = extractToolText(result.content);
    const payload = extractResultPayload(text);
    if (!payload || payload === 'undefined') {
      throw new Error('Playwright MCP returned empty evaluation result');
    }
    try {
      return JSON.parse(payload) as T;
    } catch (error) {
      throw new Error(`Failed to parse Playwright MCP evaluation result: ${String(error)}`);
    }
  }

  private buildSearchUrl(params: SearchParams): string {
    const baseUrl = 'https://www.airbnb.com/s';
    const searchParams = new URLSearchParams();

    searchParams.append('query', params.location);
    searchParams.append('checkin', params.checkIn);
    searchParams.append('checkout', params.checkOut);
    searchParams.append('adults', params.guests?.toString() || '2');

    if (params.budgetMin) {
      searchParams.append('price_min', params.budgetMin.toString());
    }
    if (params.budgetMax) {
      searchParams.append('price_max', params.budgetMax.toString());
    }

    return `${baseUrl}?${searchParams.toString()}`;
  }

  private parseListings(rawListings: unknown[], currency: string): Listing[] {
    return rawListings.map(item => {
      const record = item as Record<string, string>;
      return {
        title: record.title,
        pricePerNight: this.parsePrice(record.price),
        currency,
        rating: record.rating ? parseFloat(record.rating) : null,
        reviewCount: null,
        reviewSummary: null,
        url: this.normalizeUrl(record.url),
        imageUrl: record.imageUrl || null
      };
    }).filter(l => l.title && l.pricePerNight);
  }

  private parsePrice(priceStr: string): number {
    const match = priceStr.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(/,/g, ''), 10) : 0;
  }

  private parseRatingValue(text: string): number | null {
    const match = text.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }

  private parseCountValue(text: string): number | null {
    const match = text.replace(/,/g, '').match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  private normalizeUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://www.airbnb.com${url.startsWith('/') ? '' : '/'}${url}`;
  }
}

function extractToolText(content: unknown): string {
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
  return texts.join('\n').trim();
}

function extractResultPayload(text: string): string | null {
  if (!text) return null;
  const match = text.match(/### Result\n([\s\S]*?)(?:\n### |\n$)/);
  return match?.[1]?.trim() ?? null;
}

function extractImageData(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const record = part as Record<string, unknown>;
    if (record.type === 'image' && typeof record.data === 'string') {
      return record.data;
    }
    if (record.type === 'resource' && record.resource && typeof record.resource === 'object') {
      const resource = record.resource as Record<string, unknown>;
      if (typeof resource.blob === 'string') {
        return resource.blob;
      }
    }
  }
  return null;
}
