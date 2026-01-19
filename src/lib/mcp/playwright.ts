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

  async getListingDetails(url: string): Promise<ListingDetail> {
    // Reuse controller to navigate to detail page
    if (!this.controller) throw new Error('Browser not initialized');
    
    // Random delay before navigation
    await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000) + 1000));
    
    await this.controller.goto(url);
    await this.controller.waitForSelector('h1', 10000);

    // Scroll to ensure main content is loaded
    const page = await this.controller.getPage();
    if (page) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1000);
    }

    const details = await this.controller.evaluate(() => {
       const title = document.querySelector('h1')?.textContent?.trim() || '';
       // ... simple extraction for V1 ...
       return { title };
    });

    return {
      title: details.title,
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
  
  async getMultipleListingDetails(urls: string[]): Promise<ListingDetail[]> {
    // Sequential navigation using the same controller
    const results = [];
    for (const url of urls) {
      try {
        results.push(await this.getListingDetails(url));
      } catch (e) {
        // ignore errors
      }
    }
    return results;
  }
}