// Playwright MCP Adapter Implementation

import { MCPAdapter } from '@/types/mcp';
import { SearchParams, Listing, ListingDetail, Review } from '@/types/listing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '@/lib/utils/logger';

interface PlaywrightConfig {
  port: number;
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  timeout: number;
}

export class PlaywrightAdapter implements MCPAdapter {
  readonly name = 'playwright' as const;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: PlaywrightConfig;
  private connected = false;

  constructor(config: PlaywrightConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      logger.info('mcp', 'playwright_connecting', {
        headless: this.config.headless,
        browser: this.config.browser,
      });

      // Create MCP client transport for Playwright
      const env = {
        ...process.env,
        // Pass headless config to Playwright MCP server if supported
        PLAYWRIGHT_HEADLESS: this.config.headless ? 'true' : 'false',
        PLAYWRIGHT_BROWSER: this.config.browser,
      };

      this.transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@playwright/mcp'],
        env: env as Record<string, string>,
      });

      // Create MCP client
      this.client = new Client(
        {
          name: 'airbnb-search-agent',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await this.client.connect(this.transport);
      this.connected = true;

      logger.info('mcp', 'playwright_connected', {
        headless: this.config.headless,
        browser: this.config.browser,
      });
    } catch (error) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('mcp', 'playwright_connect_failed', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`Failed to connect to Playwright: ${errorMessage}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.client?.close();
      this.transport = null;
      this.client = null;
      this.connected = false;
    } catch (error) {
      throw new Error(`Failed to disconnect from Playwright: ${error}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const tools = await this.client?.listTools();
      return tools !== undefined && tools.tools.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Take a screenshot of the current page
   */
  async takeScreenshot(): Promise<string | null> {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      logger.debug('mcp', 'playwright_taking_screenshot', {});
      const screenshotResult = await this.client.callTool({
        name: 'browser_take_screenshot',
        arguments: { fullPage: false }
      });

      const extractedData = this.extractMCPResult(screenshotResult);
      if (typeof extractedData === 'string') {
        // Base64 encoded image
        return extractedData;
      } else if (extractedData && typeof extractedData === 'object') {
        const data = extractedData as Record<string, unknown>;
        if (typeof data.image === 'string') {
          return data.image;
        }
      }
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('mcp', 'playwright_screenshot_failed', {
        error: errorMessage,
      });
      return null;
    }
  }

  async searchAirbnb(params: SearchParams): Promise<Listing[]> {
    if (!this.connected || !this.client) {
      throw new Error('Playwright adapter not connected');
    }

    try {
      const searchUrl = this.buildSearchUrl(params);
      logger.info('mcp', 'playwright_search_start', {
        url: searchUrl,
        location: params.location,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        guests: params.guests,
      });

      // Use form-based search to avoid anti-bot detection
      // This mimics human behavior by navigating to homepage and filling the search form
      logger.debug('mcp', 'playwright_form_search', { location: params.location });

      // Build the search code with parameters
      const searchCode = this.buildFormSearchCode(params);

      const result = await this.client.callTool({
        name: 'browser_run_code',
        arguments: {
          code: searchCode
        }
      });

      const extractedData = this.extractMCPResult(result);

      logger.debug('mcp', 'playwright_extract_result', {
        hasResult: !!extractedData,
        resultType: typeof extractedData,
      });

      // Check if extraction was successful
      if (extractedData && typeof extractedData === 'object') {
        const data = extractedData as { success?: boolean; listings?: unknown[]; url?: string; error?: string };

        if (!data.success) {
          logger.warn('mcp', 'playwright_extraction_failed', {
            error: data.error,
            finalUrl: data.url,
          });
        }

        if (data.listings && Array.isArray(data.listings)) {
          const listings = this.parseListings(data.listings, params.currency || 'USD');

          logger.info('mcp', 'playwright_search_complete', {
            listingCount: listings.length,
            location: params.location,
            finalUrl: data.url,
          });

          return listings;
        }
      }

      // If we get here, extraction failed
      logger.warn('mcp', 'playwright_no_listings_extracted', {
        location: params.location,
      });
      return [];

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('mcp', 'playwright_search_failed', {
        error: errorMessage,
        stack: errorStack,
        location: params.location,
      });

      throw new Error(`Failed to search Airbnb: ${errorMessage}`);
    }
  }

  private buildSearchUrl(params: SearchParams): string {
    const baseUrl = 'https://www.airbnb.com/s';
    const searchParams = new URLSearchParams();
    searchParams.append('query', params.location);
    searchParams.append('checkin', params.checkIn);
    searchParams.append('checkout', params.checkOut);
    searchParams.append('adults', params.guests?.toString() || '2');
    if (params.budgetMin) searchParams.append('price_min', params.budgetMin.toString());
    if (params.budgetMax) searchParams.append('price_max', params.budgetMax.toString());
    return `${baseUrl}?${searchParams.toString()}`;
  }

  /**
   * Build form-based search code for anti-bot evasion
   * This mimics human behavior by:
   * 1. Navigating to homepage (not direct URL with params)
   * 2. Adding random delays between actions
   * 3. Filling form fields step by step
   * 4. Using realistic typing patterns
   */
  private buildFormSearchCode(params: SearchParams): string {
    // Generate random delays to mimic human behavior
    const randomDelay = (min: number, max: number) =>
      `Math.floor(Math.random() * ${max - min}) + ${min}`;

    return `async (page) => {
      try {
        // Step 1: Navigate to Airbnb homepage (accept any redirect for regional domains)
        await page.goto('https://www.airbnb.com/', {
          waitUntil: 'load',
          timeout: 30000
        });

        // Random delay to mimic human reading the page
        await page.waitForTimeout(${randomDelay(1500, 2500)});

        // Step 2: Click location input to activate search form
        const locationInput = page.locator('input[id="bigsearch-query-location-input"]');
        await locationInput.click();
        await page.waitForTimeout(${randomDelay(300, 600)});

        // Step 3: Type location with slight delay (mimics typing)
        await locationInput.fill('${params.location}');
        await page.waitForTimeout(${randomDelay(800, 1200)});

        // Step 4: Click first autocomplete suggestion if available
        try {
          const firstSuggestion = page.locator('[data-testid="option-0"]').first();
          await firstSuggestion.waitFor({ timeout: 3000 });
          await page.waitForTimeout(${randomDelay(200, 400)});
          await firstSuggestion.click();
        } catch (e) {
          // No autocomplete available, continue with typed location
          console.log('No autocomplete suggestion, continuing...');
        }

        await page.waitForTimeout(${randomDelay(500, 800)});

        // Step 5: Try to set dates if date picker is available
        try {
          // Look for date button (may have different labels based on locale)
          const dateButton = page.locator('[data-testid="structured-search-input-field-split-dates-0"]').or(
            page.locator('button').filter({ hasText: /入住|Check in|时间/i })
          ).first();

          const dateButtonVisible = await dateButton.isVisible().catch(() => false);
          if (dateButtonVisible) {
            await dateButton.click();
            await page.waitForTimeout(${randomDelay(600, 1000)});

            // Note: Date selection is complex, for now we rely on URL params after search
            // The search results page will show listings for default dates
            // Close date picker by pressing Escape
            await page.keyboard.press('Escape');
            await page.waitForTimeout(${randomDelay(300, 500)});
          }
        } catch (e) {
          console.log('Date picker interaction skipped');
        }

        // Step 6: Try to set guests if guests selector is available
        try {
          const guestsButton = page.locator('[data-testid="structured-search-input-field-guests-button"]').or(
            page.locator('button').filter({ hasText: /人员|客人|Guests/i })
          ).first();

          const guestsButtonVisible = await guestsButton.isVisible().catch(() => false);
          if (guestsButtonVisible) {
            await guestsButton.click();
            await page.waitForTimeout(${randomDelay(400, 700)});

            // Try to set adult count (default is usually 1, we may need to increase)
            const targetGuests = ${params.guests || 2};
            const increaseButton = page.locator('[data-testid="stepper-adults-increase-button"]');
            const increaseVisible = await increaseButton.isVisible().catch(() => false);

            if (increaseVisible && targetGuests > 1) {
              // Click increase button (targetGuests - 1) times since default is usually 1
              for (let i = 0; i < targetGuests - 1; i++) {
                await increaseButton.click();
                await page.waitForTimeout(${randomDelay(200, 400)});
              }
            }

            // Close guests selector by pressing Escape
            await page.keyboard.press('Escape');
            await page.waitForTimeout(${randomDelay(300, 500)});
          }
        } catch (e) {
          console.log('Guests selector interaction skipped');
        }

        // Step 7: Click search button
        await page.waitForTimeout(${randomDelay(400, 700)});
        const searchButton = page.locator('button[data-testid="structured-search-input-search-button"]');
        await searchButton.click();

        // Step 8: Wait for navigation to search results
        await page.waitForLoadState('load');
        await page.waitForTimeout(${randomDelay(2500, 3500)});

        // Step 9: Check for listings
        const listingCount = await page.locator('[data-testid="card-container"]').count();

        if (listingCount === 0) {
          // Try alternative selector
          const altCount = await page.locator('div[itemprop="itemListElement"]').count();
          if (altCount === 0) {
            throw new Error('No listings found on page after search');
          }
        }

        // Step 10: Extract listings with robust selectors
        // Note: Images will be fetched from detail pages for better quality
        const listings = await page.evaluate(() => {
          // Try primary selector
          let cards = Array.from(document.querySelectorAll('[data-testid="card-container"]'));

          // Fallback to alternative selector if needed
          if (cards.length === 0) {
            cards = Array.from(document.querySelectorAll('div[itemprop="itemListElement"]'));
          }

          return cards.slice(0, 10).map(card => {
            // Try multiple selectors for each field
            const title =
              card.querySelector('[data-testid="listing-card-title"]')?.textContent?.trim() ||
              card.querySelector('meta[itemprop="name"]')?.getAttribute('content') ||
              card.querySelector('[id^="title_"]')?.textContent?.trim() ||
              '';

            const price =
              card.querySelector('[data-testid="price-availability-row"]')?.textContent?.trim() ||
              card.querySelector('span[class*="Price"]')?.textContent?.trim() ||
              card.querySelector('._1jo4hgw')?.textContent?.trim() ||
              '';

            const rating =
              card.querySelector('[aria-label*="rating"]')?.textContent?.trim() ||
              card.querySelector('[aria-label*="评分"]')?.textContent?.trim() ||
              '';

            const url =
              card.querySelector('a[href*="/rooms/"]')?.getAttribute('href') ||
              '';

            // Convert relative URL to absolute if needed
            const fullUrl = url.startsWith('http') ? url :
              url.startsWith('/') ? 'https://www.airbnb.com' + url : '';

            // Note: imageUrl will be extracted from detail page for better quality
            return { title, price, rating, url: fullUrl };
          }).filter(item => item.title && item.price);
        });

        return { success: true, listings, url: page.url(), listingCount: listings.length };
      } catch (error) {
        return { success: false, error: error.message, url: page.url() };
      }
    }`;
  }

  /**
   * Build detail page extraction code with anti-bot measures
   */
  private buildDetailExtractionCode(url: string): string {
    return `async (page) => {
      try {
        // Random delay before navigation (anti-bot)
        await page.waitForTimeout(Math.floor(Math.random() * 500) + 800);

        // Navigate to listing detail page
        // Use domcontentloaded for faster navigation (images load async anyway)
        await page.goto('${url}', {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        });

        // Random delay after page load (mimics human reading)
        await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1500);

        // Wait for main content to load
        await page.waitForSelector('h1', { timeout: 10000 });

        // Wait for images to load
        await page.waitForTimeout(1000);

        // Scroll down to trigger lazy loading of reviews
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(Math.floor(Math.random() * 500) + 500);
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(Math.floor(Math.random() * 500) + 500);

        // Scroll more to load reviews section
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(Math.floor(Math.random() * 500) + 800);

        // Extract listing details with robust selectors
        const details = await page.evaluate(() => {
          // Title extraction with fallbacks
          const title =
            document.querySelector('h1')?.textContent?.trim() ||
            document.querySelector('[data-section-id="TITLE_DEFAULT"] h1')?.textContent?.trim() ||
            '';

          // Price extraction with fallbacks
          const price =
            document.querySelector('[data-section-id="BOOK_IT_SIDEBAR"]')?.textContent?.trim() ||
            document.querySelector('span[class*="_1y74zjx"]')?.textContent?.trim() ||
            '';

          // Rating extraction with fallbacks (handles both English and Chinese labels)
          const ratingElement =
            document.querySelector('[aria-label*="rating"]') ||
            document.querySelector('[aria-label*="评分"]') ||
            document.querySelector('span[class*="r1dxllyb"]');
          const rating = ratingElement?.textContent?.trim() || '';

          // Review count extraction
          const reviewCountMatch = document.body.innerText.match(/(\\d+)\\s*(条评价|reviews|条评论)/i);
          const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1], 10) : null;

          // Image extraction - get the first main image from the detail page
          // Try multiple selectors for the main gallery image
          let imageUrl = '';

          // Method 1: Look for the main hero image in the photo gallery
          const mainImage = document.querySelector('[data-testid="photo-viewer-section"] img') ||
                           document.querySelector('[data-section-id="HERO_DEFAULT"] img') ||
                           document.querySelector('picture img[src*="airbnb"]');
          if (mainImage) {
            imageUrl = mainImage.getAttribute('src') || '';
          }

          // Method 2: Look for any large image with airbnb CDN
          if (!imageUrl) {
            const allImages = Array.from(document.querySelectorAll('img'));
            const airbnbImage = allImages.find(img => {
              const src = img.getAttribute('src') || '';
              // Look for Airbnb CDN images that are large enough (not thumbnails)
              return src.includes('a0.muscache.com') &&
                     (src.includes('im/pictures') || src.includes('im/users')) &&
                     !src.includes('32x32') && !src.includes('24x24');
            });
            if (airbnbImage) {
              imageUrl = airbnbImage.getAttribute('src') || '';
            }
          }

          // Method 3: Look for picture element with source
          if (!imageUrl) {
            const pictureSource = document.querySelector('picture source[srcset*="airbnb"], picture source[srcset*="muscache"]');
            if (pictureSource) {
              const srcset = pictureSource.getAttribute('srcset') || '';
              const firstUrl = srcset.split(',')[0].split(' ')[0];
              imageUrl = firstUrl;
            }
          }

          // Review extraction with multiple selector attempts
          let reviews = [];

          // Try primary selector
          const reviewElements = document.querySelectorAll('[data-review-id]');
          if (reviewElements.length > 0) {
            reviews = Array.from(reviewElements).slice(0, 15).map(r => ({
              text: r.querySelector('[data-testid="review-text"]')?.textContent?.trim() ||
                    r.querySelector('span[class*="ll4r2nl"]')?.textContent?.trim() ||
                    r.textContent?.trim() || '',
              author: r.querySelector('[data-testid="review-author"]')?.textContent?.trim() ||
                      r.querySelector('h3')?.textContent?.trim() || 'Guest',
              date: r.querySelector('[data-testid="review-date"]')?.textContent?.trim() || ''
            })).filter(r => r.text && r.text.length > 10);
          }

          // Fallback: try alternative review selectors
          if (reviews.length === 0) {
            // Look for review sections by common class patterns
            const altReviewContainers = document.querySelectorAll('[class*="_1bx6kii"], [class*="review"]');
            reviews = Array.from(altReviewContainers).slice(0, 15).map(r => {
              const text = r.textContent?.trim() || '';
              // Only include if it looks like a review (has reasonable length)
              return { text, author: 'Guest', date: '' };
            }).filter(r => r.text.length > 30 && r.text.length < 2000);
          }

          return { title, price, rating, reviews, imageUrl, reviewCount };
        });

        return { success: true, details };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }`;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract data from MCP tool result
   * MCP tools may return content as array with { text: string } or direct value
   */
  private extractMCPResult(result: unknown): unknown {
    if (!result || typeof result !== 'object') {
      return null;
    }

    const resultObj = result as Record<string, unknown>;
    const content = resultObj.content;

    if (!content) {
      return null;
    }

    // If content is an array, try to extract text from first item
    if (Array.isArray(content) && content.length > 0) {
      const firstItem = content[0];
      if (firstItem && typeof firstItem === 'object') {
        const item = firstItem as Record<string, unknown>;
        // Check if it's { text: string } format
        if ('text' in item && typeof item.text === 'string') {
          let text = item.text;

          // Handle browser_run_code format: "### Result\n{json}\n\n### Other sections..."
          if (text.startsWith('### Result\n')) {
            text = text.substring('### Result\n'.length);
            // Extract only the JSON part (before the next ### section)
            const nextSectionIndex = text.indexOf('\n\n###');
            if (nextSectionIndex !== -1) {
              text = text.substring(0, nextSectionIndex);
            }
          }

          try {
            // Try to parse as JSON
            return JSON.parse(text);
          } catch {
            // If not JSON, return the text
            return text;
          }
        }
        // Otherwise return the object directly
        return firstItem;
      }
      // If array contains direct values
      return content;
    }

    // If content is direct value
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    }

    return content;
  }

  private parseListings(content: unknown, currency: string): Listing[] {
    const listings: Listing[] = [];
    const data = Array.isArray(content) ? content : [content];

    for (const item of data) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title : '';
      const priceRaw = toStringValue(record.price);
      if (title && priceRaw) {
        listings.push({
          title,
          pricePerNight: this.parsePrice(priceRaw),
          currency,
          rating: toNumberValue(record.rating),
          reviewCount: null,
          reviewSummary: null,
          url: typeof record.url === 'string' ? record.url : '',
          imageUrl: null // Image will be fetched from detail page
        });
      }
    }
    return listings;
  }

  private parsePrice(priceStr: string): number {
    const match = priceStr.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(/,/g, '')) : 0;
  }

  async getListingDetails(url: string): Promise<ListingDetail> {
    if (!this.connected || !this.client) {
      throw new Error('Playwright adapter not connected');
    }

    try {
      logger.debug('mcp', 'playwright_fetching_details', { url });

      // Build detail extraction code with anti-bot measures
      const detailCode = this.buildDetailExtractionCode(url);

      const result = await this.client.callTool({
        name: 'browser_run_code',
        arguments: {
          code: detailCode
        }
      });

      const extractedData = this.extractMCPResult(result);

      if (extractedData && typeof extractedData === 'object') {
        const data = extractedData as { success?: boolean; details?: unknown; error?: string };

        if (!data.success) {
          logger.warn('mcp', 'playwright_details_extraction_failed', {
            error: data.error,
            url,
          });
        }

        if (data.details) {
          return this.parseListingDetail(data.details, url);
        }
      }

      // Return empty detail if extraction failed
      return this.parseListingDetail({}, url);
    } catch (error) {
      throw new Error(`Failed to get listing details: ${error}`);
    }
  }

  private parseListingDetail(content: unknown, url: string): ListingDetail {
    const reviews: Review[] = [];
    const record = content && typeof content === 'object' ? (content as Record<string, unknown>) : {};

    const rawReviews = Array.isArray(record.reviews) ? record.reviews : [];
    for (const review of rawReviews) {
      if (!review || typeof review !== 'object') continue;
      const reviewRecord = review as Record<string, unknown>;
      const text = typeof reviewRecord.text === 'string' ? reviewRecord.text : '';
      if (!text) continue;
      reviews.push({
        text,
        author: typeof reviewRecord.author === 'string' ? reviewRecord.author : 'Anonymous',
        date: typeof reviewRecord.date === 'string' ? reviewRecord.date : new Date().toISOString()
      });
    }

    // Extract review count from page data or use reviews array length
    const extractedReviewCount = typeof record.reviewCount === 'number'
      ? record.reviewCount
      : (reviews.length > 0 ? reviews.length : null);

    // Extract image URL from detail page
    const imageUrl = typeof record.imageUrl === 'string' && record.imageUrl ? record.imageUrl : null;

    return {
      title: typeof record.title === 'string' ? record.title : '',
      pricePerNight: record.price ? this.parsePrice(toStringValue(record.price)) : 0,
      currency: 'USD',
      rating: toNumberValue(record.rating),
      reviewCount: extractedReviewCount,
      reviewSummary: null,
      reviews,
      url,
      imageUrl
    };
  }

  async getMultipleListingDetails(urls: string[]): Promise<ListingDetail[]> {
    const results: ListingDetail[] = [];

    // Process sequentially to avoid net::ERR_ABORTED errors
    // Playwright MCP uses a single browser, parallel navigation causes conflicts
    for (let i = 0; i < urls.length; i++) {
      try {
        logger.debug('mcp', 'playwright_fetching_details_sequential', {
          index: i + 1,
          total: urls.length,
          url: urls[i].substring(0, 80) + '...'
        });

        const detail = await this.getListingDetails(urls[i]);
        results.push(detail);

        // Add delay between requests to avoid rate limiting
        if (i < urls.length - 1) {
          await this.delay(1000 + Math.random() * 1000); // 1-2 seconds random delay
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn('mcp', 'playwright_detail_fetch_failed', {
          url: urls[i],
          error: errorMessage
        });
        // Continue with other URLs even if one fails
        results.push(this.createEmptyDetail(urls[i]));
      }
    }

    return results;
  }

  /**
   * Create an empty detail object for failed fetches
   */
  private createEmptyDetail(url: string): ListingDetail {
    return {
      title: '',
      pricePerNight: 0,
      currency: 'USD',
      rating: null,
      reviewCount: null,
      reviewSummary: null,
      reviews: [],
      url,
      imageUrl: null
    };
  }
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
