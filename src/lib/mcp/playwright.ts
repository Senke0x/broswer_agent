// Playwright Adapter Implementation (Refactored for Direct Control)

import { MCPAdapter } from '@/types/mcp';
import { SearchParams, Listing, ListingDetail, Review } from '@/types/listing';
import { logger } from '@/lib/utils/logger';
import { BrowserController } from '@/lib/browser/BrowserController';

interface PlaywrightConfig {
  port: number;
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  timeout: number;
}

export class PlaywrightAdapter implements MCPAdapter {
  readonly name = 'playwright' as const;
  private controller: BrowserController | null = null;
  private config: PlaywrightConfig;
  private connected = false;

  constructor(config: PlaywrightConfig) {
    this.config = config;
  }

  // Hook to capture screenshots from the controller
  private onScreenshot = (_base64: string) => {
    // This will be assigned by the consumer (route.ts)
    // We store it here as a property so we can pass it to controller
  };

  // Allow setting the screenshot callback dynamically
  public setScreenshotCallback(callback: (base64: string) => void) {
    this.onScreenshot = callback;
    // If controller exists, update its config (not possible directly, so we rely on init)
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      logger.info('mcp', 'playwright_connecting_direct', {
        headless: this.config.headless,
      });

      this.controller = new BrowserController({
        headless: this.config.headless,
        onScreenshot: (data) => this.onScreenshot(data),
        onStatus: (status) => logger.debug('browser', 'status_update', { status }) // Optional local logging
      });

      await this.controller.initialize();
      this.connected = true;

    } catch (error) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('mcp', 'playwright_connect_failed', { error: errorMessage });
      throw new Error(`Failed to launch Playwright: ${errorMessage}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.controller?.close();
      this.controller = null;
      this.connected = false;
    } catch (error) {
      throw new Error(`Failed to close Playwright: ${error}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<boolean> {
    return this.connected && this.controller !== null;
  }

  // Proxy to controller's capture method
  async takeScreenshot(): Promise<string | null> {
    if (!this.controller) return null;
    // We don't return the screenshot here because the controller pushes it via callback
    // But to satisfy the interface, we trigger a capture and return null (or update interface later)
    await this.controller.captureState();
    return null;
  }

  async searchAirbnb(params: SearchParams): Promise<Listing[]> {
    if (!this.controller) throw new Error('Browser not initialized');

    try {
      logger.info('mcp', 'playwright_search_start', { location: params.location });
      const page = await this.controller.getPage();
      if (!page) throw new Error('No page available');

      // --- Helper: Random Delay ---
      const randomDelay = (min: number, max: number) =>
        new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

      // --- Helper: Scroll to load images ---
      const smoothScroll = async () => {
        await page.evaluate(async () => {
          await new Promise<void>((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;

              if (totalHeight >= scrollHeight / 2) { // Scroll half way down
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
        });
      };

      // --- Step 1: Navigation ---
      await this.controller.goto('https://www.airbnb.com/');
      await randomDelay(2000, 3000); // Wait after load

      // --- Step 2: Location ---
      await this.controller.click('input[id="bigsearch-query-location-input"]', 'Clicking location input...');
      await randomDelay(500, 1000);

      await this.controller.type('input[id="bigsearch-query-location-input"]', params.location, `Typing location: ${params.location}...`);
      await randomDelay(1000, 1500); // Wait for suggestions

      try {
        await this.controller.waitForSelector('[data-testid="option-0"]', 5000);
        await this.controller.click('[data-testid="option-0"]', 'Selecting first suggestion...');
        await randomDelay(500, 1000);
      } catch (e) {
        logger.warn('browser', 'no_suggestion', { error: String(e) });
      }

      // --- Step 3: Dates (Simplified) ---
      // Close date picker if open
      await page.keyboard.press('Escape');
      await randomDelay(500, 800);

      // --- Step 4: Search ---
      const searchBtn = await page.locator('button[data-testid="structured-search-input-search-button"]').first();
      if (await searchBtn.isVisible()) {
        await this.controller.click('button[data-testid="structured-search-input-search-button"]', 'Clicking Search...');
      }

      // --- Step 5: Wait for Results & Load Images ---
      await page.waitForLoadState('load');
      await page.waitForTimeout(3000); // Initial wait for grid

      // Scroll to trigger lazy loading
      await smoothScroll();
      await randomDelay(2000, 3000); // Wait for images to render

      // --- Step 6: Extract ---
      const listings = await this.controller.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('[data-testid="card-container"]')).slice(0, 10);
        return cards.map(card => {
          const title = card.querySelector('[data-testid="listing-card-title"]')?.textContent?.trim() ||
                        card.querySelector('[id^="title_"]')?.textContent?.trim() || '';

          const price = card.querySelector('[data-testid="price-availability-row"]')?.textContent?.trim() ||
                        card.querySelector('span[class*="_1y74zjx"]')?.textContent?.trim() || ''; // Fallback class

          const linkElement = card.querySelector('a[href*="/rooms/"]');
          const link = linkElement?.getAttribute('href') || '';

          const rating = card.querySelector('[aria-label*="rating"]')?.textContent?.trim() ||
                         card.querySelector('span[role="img"]')?.getAttribute('aria-label')?.trim() || '';

          // Extract image from the first image in the card's carousel/grid
          const imageElement = card.querySelector('img[src*="airbnb"]');
          const imageUrl = imageElement?.getAttribute('src') || '';

          return {
            title,
            price,
            rating,
            url: link.startsWith('http') ? link : `https://www.airbnb.com${link}`,
            imageUrl
          };
        });
      });

      return this.parseListings(listings, 'USD');

    } catch (error) {
      logger.error('mcp', 'search_failed', { error: String(error) });
      throw error;
    }
  }

  // ... (Keep existing parseListings, getListingDetails logic but adapt to use controller.evaluate) ...
  // For brevity, I'll port the essential parsing logic.

  private parseListings(rawListings: unknown[], currency: string): Listing[] {
    return rawListings.map(item => {
        const record = item as Record<string, string>;
        return {
            title: record.title,
            pricePerNight: this.parsePrice(record.price),
            currency,
            rating: parseFloat(record.rating) || null,
            reviewCount: null,
            reviewSummary: null,
            url: record.url,
            imageUrl: record.imageUrl || null
        };
    }).filter(l => l.title && l.pricePerNight);
  }

  private parsePrice(priceStr: string): number {
    const match = priceStr.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(/,/g, '')) : 0;
  }

  private parseRatingValue(text: string): number | null {
    const match = text.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }

  private parseCountValue(text: string): number | null {
    const match = text.replace(/,/g, '').match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  async getListingDetails(url: string): Promise<ListingDetail> {
    // Reuse controller to navigate to detail page
    if (!this.controller) throw new Error('Browser not initialized');

    logger.info('mcp', 'playwright_detail_start', { url });

    // Random delay before navigation
    await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000) + 1000));

    await this.controller.goto(url);

    const page = await this.controller.getPage();
    if (page) {
      try {
        await page.waitForLoadState('networkidle', { timeout: 8000 });
      } catch {
        // ignore network idle timeout
      }
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(800);
    }

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
      details = await this.controller.evaluate(() => {
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
        const combined = `${document.title} ${textSample}`.toLowerCase();
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
      });
    } catch (error) {
      logger.error('mcp', 'playwright_detail_extract_failed', {
        url,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    if (details.signals.length > 0) {
      logger.warn('mcp', 'playwright_detail_antibot', {
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
      logger.warn('mcp', 'playwright_detail_sparse', {
        url,
        pageTitle: details.pageTitle,
        imageCount: details.imageCount,
        loadedImageCount: details.loadedImageCount
      });
    }

    logger.info('mcp', 'playwright_detail_extracted', {
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
    // Sequential navigation using the same controller
    const results = [];
    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index];
      try {
        logger.info('mcp', 'playwright_detail_fetch', {
          url,
          index: index + 1,
          total: urls.length
        });
        results.push(await this.getListingDetails(url));
      } catch (e) {
        logger.warn('mcp', 'playwright_detail_failed', {
          url,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
    return results;
  }
}
