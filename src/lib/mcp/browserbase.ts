// Browserbase MCP Adapter Implementation

import { MCPAdapter } from '@/types/mcp';
import { SearchParams, Listing, ListingDetail, Review } from '@/types/listing';
import { logger } from '@/lib/utils/logger';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Stagehand, Page } from '@browserbasehq/stagehand';
import { z } from 'zod';

interface BrowserbaseConfig {
  mode: 'cloud' | 'local';
  // Cloud mode
  apiKey: string;
  projectId: string;
  timeout: number;
  // Local mode
  localOptions?: {
    headless: boolean;
    executablePath?: string;
    userDataDir?: string;
  };
}

export class BrowserbaseAdapter implements MCPAdapter {
  readonly name = 'browserbase' as const;
  private mode: 'cloud' | 'local';

  // Cloud mode (existing)
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  // Local mode (new)
  private stagehand: Stagehand | null = null;
  private page: Page | null = null; // Stagehand page instance

  private config: BrowserbaseConfig;
  private connected = false;
  private screenshotCallback?: (base64: string) => void;

  constructor(config: BrowserbaseConfig) {
    this.config = config;
    this.mode = config.mode || 'cloud';
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (this.mode === 'local') {
      await this.connectLocal();
    } else {
      await this.connectCloud();
    }
  }

  private async maybeCaptureScreenshot(): Promise<void> {
    if (!this.screenshotCallback) return;
    try {
      await this.takeScreenshot();
    } catch {
      // Ignore screenshot errors
    }
  }

  private async connectLocal(): Promise<void> {
    try {
      this.stagehand = new Stagehand({
        env: 'LOCAL',
        localBrowserLaunchOptions: {
          headless: this.config.localOptions?.headless ?? true,
          executablePath: this.config.localOptions?.executablePath,
          userDataDir: this.config.localOptions?.userDataDir,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      });
      await this.stagehand.init();
      this.page = await this.getLocalPage();
      this.connected = true;

      // Inject visual feedback CSS after connection (skip if it fails)
      // Note: This is optional visual feedback, not critical for functionality
      try {
        await this.injectVisualFeedback();
      } catch (error) {
        // Silently ignore visual feedback injection errors
        logger.warn('mcp', 'browserbase_visual_feedback_failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to local Chrome via Stagehand: ${error}`);
    }
  }

  private async connectCloud(): Promise<void> {
    try {
      // Create MCP client transport
      this.transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@browserbasehq/mcp-server-browserbase'],
        env: {
          ...process.env,
          BROWSERBASE_API_KEY: this.config.apiKey,
          BROWSERBASE_PROJECT_ID: this.config.projectId,
        },
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
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to Browserbase: ${error}`);
    }
  }

  private async getLocalPage(): Promise<Page> {
    if (!this.stagehand) {
      throw new Error('Stagehand not initialized');
    }

    if (this.page) {
      return this.page;
    }

    const context = this.stagehand.context;
    const existingPage = context.activePage() ?? context.pages()[0];
    if (existingPage) {
      this.page = existingPage;
      return existingPage;
    }

    const newPage = await context.newPage();
    this.page = newPage;
    return newPage;
  }

  private async injectVisualFeedback(): Promise<void> {
    if (this.mode !== 'local' || !this.page) return;

    // Skip visual feedback injection to avoid Stagehand evaluate issues
    // This is optional visual feedback and not critical for functionality
    // The __name error suggests Stagehand's evaluate API may have compatibility issues
    //
    // Original code commented out due to Stagehand evaluate compatibility issues:
    // try {
    //   await this.page.evaluate(() => {
    //     // Add cursor overlay
    //     if (document.getElementById('stagehand-cursor')) return;
    //     const cursor = document.createElement('div');
    //     cursor.id = 'stagehand-cursor';
    //     cursor.style.cssText = `
    //       position: fixed;
    //       width: 20px;
    //       height: 20px;
    //       background: red;
    //       border-radius: 50%;
    //       pointer-events: none;
    //       z-index: 999999;
    //       transform: translate(-50%, -50%);
    //       transition: all 0.1s ease;
    //       display: none;
    //     `;
    //     document.body.appendChild(cursor);
    //     document.addEventListener('mousemove', (e) => {
    //       cursor.style.display = 'block';
    //       cursor.style.left = e.clientX + 'px';
    //       cursor.style.top = e.clientY + 'px';
    //     });
    //     const style = document.createElement('style');
    //     style.id = 'stagehand-highlight-styles';
    //     style.textContent = `
    //       *:focus {
    //         outline: 2px solid blue !important;
    //         outline-offset: 2px;
    //       }
    //     `;
    //     document.head.appendChild(style);
    //   });
    // } catch (error) {
    //   console.warn('Failed to inject visual feedback:', error);
    // }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      if (this.mode === 'local') {
        await this.stagehand?.close();
        this.stagehand = null;
        this.page = null;
      } else {
        await this.client?.close();
        this.transport = null;
        this.client = null;
      }
      this.connected = false;
    } catch (error) {
      throw new Error(`Failed to disconnect from Browserbase: ${error}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  setScreenshotCallback(callback: (base64: string) => void): void {
    this.screenshotCallback = callback;
  }

  async takeScreenshot(): Promise<string | null> {
    if (!this.connected) return null;

    if (this.mode === 'local') {
      const page = await this.getLocalPage();
      const buffer = await page.screenshot({ fullPage: true, type: 'png' });
      const base64 = buffer.toString('base64');
      if (this.screenshotCallback) {
        this.screenshotCallback(base64);
        return null;
      }
      return base64;
    }

    if (!this.client) return null;

    const result = await this.client.callTool({
      name: 'browserbase_screenshot',
      arguments: { fullPage: true }
    });

    if (!Array.isArray(result.content)) return null;

    const imagePart = result.content.find(
      (item) => item && typeof item === 'object' && 'type' in item && item.type === 'image'
    ) as { data?: string } | undefined;

    if (imagePart?.data) {
      if (this.screenshotCallback) {
        this.screenshotCallback(imagePart.data);
        return null;
      }
      return imagePart.data;
    }

    const resourcePart = result.content.find(
      (item) => item && typeof item === 'object' && 'type' in item && item.type === 'resource'
    ) as { resource?: { blob?: string; mimeType?: string } } | undefined;

    if (resourcePart?.resource?.blob && resourcePart.resource.mimeType?.startsWith('image/')) {
      if (this.screenshotCallback) {
        this.screenshotCallback(resourcePart.resource.blob);
        return null;
      }
      return resourcePart.resource.blob;
    }

    return null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.connected) return false;

    try {
      if (this.mode === 'local') {
        const page = await this.getLocalPage();
        await page.title();
        return true;
      }

      // Try to list available tools as a health check
      const tools = await this.client?.listTools();
      return tools !== undefined && tools.tools.length > 0;
    } catch {
      return false;
    }
  }

  async searchAirbnb(params: SearchParams): Promise<Listing[]> {
    if (!this.connected) {
      throw new Error('Browserbase adapter not connected');
    }

    if (this.mode === 'local') {
      return this.searchAirbnbLocal(params);
    }

    return this.searchAirbnbCloud(params);
  }

  private async searchAirbnbCloud(params: SearchParams): Promise<Listing[]> {
    if (!this.client) {
      throw new Error('Browserbase adapter not connected');
    }

    try {
      // Build Airbnb search URL
      const searchUrl = this.buildSearchUrl(params);

      // Navigate to search page
      const navigateResult = await this.client.callTool({
        name: 'browserbase_stagehand_navigate',
        arguments: { url: searchUrl }
      });
      this.assertToolSuccess(navigateResult, 'Navigate to search page');

      // Wait for listings to load
      await this.delay(2000);

      // Extract listings using structured extraction
      const extractResult = await this.client.callTool({
        name: 'browserbase_stagehand_extract',
        arguments: {
          instruction: 'Extract all Airbnb listing cards with title, price, rating, review count, and URL'
        }
      });
      this.assertToolSuccess(extractResult, 'Extract listings');

      // Parse and format results
      const listings = this.parseListings(extractResult.content, params.currency || 'USD');

      // Return top 10 listings
      return listings.slice(0, 10);
    } catch (error) {
      throw new Error(`Failed to search Airbnb: ${error}`);
    }
  }

  private async searchAirbnbLocal(params: SearchParams): Promise<Listing[]> {
    if (!this.stagehand) {
      throw new Error('Browserbase adapter not connected');
    }

    try {
      const page = await this.getLocalPage();
      const uiListings = await this.searchAirbnbLocalUi(page, params);
      if (uiListings && uiListings.length > 0) {
        return uiListings;
      }

      return this.searchAirbnbLocalByUrl(page, params);
    } catch (error) {
      logger.error('mcp', 'browserbase_search_local_failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  private async searchAirbnbLocalUi(page: Page, params: SearchParams): Promise<Listing[] | null> {
    try {
      // Use simpler goto API - Stagehand may not support all Playwright options
      await page.goto('https://www.airbnb.com/');
      await this.delay(2000); // Wait for initial load
    } catch (error) {
      logger.warn('mcp', 'browserbase_goto_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }

    try {
      // Stagehand Page API may expect timeout as number, not object
      await page.waitForLoadState('networkidle', this.config.timeout);
    } catch {
      // ignore network idle timeouts
    }

    await this.delay(1000);
    await this.maybeCaptureScreenshot();

    const locationSelector = 'input[id="bigsearch-query-location-input"]';
    const hasLocationInput = await this.waitForVisible(page, locationSelector, 10000);
    if (!hasLocationInput) {
      return null;
    }

    const locationInput = page.locator(locationSelector);
    await locationInput.click();
    await this.delay(300);
    await locationInput.fill(params.location);
    await this.delay(1200);

    const suggestionSelector = '[data-testid="option-0"]';
    if (await this.waitForVisible(page, suggestionSelector, 5000)) {
      await page.locator(suggestionSelector).click();
      await this.delay(500);
    }

    await this.maybeCaptureScreenshot();

    const searchButtonSelector = 'button[data-testid="structured-search-input-search-button"]';
    if (await this.waitForVisible(page, searchButtonSelector, 5000)) {
      await page.locator(searchButtonSelector).click();
    } else {
      await page.evaluate(() => {
        const button = document.querySelector('button[data-testid="structured-search-input-search-button"]');
        if (button instanceof HTMLElement) button.click();
      });
    }

    try {
      // Stagehand Page API may expect timeout as number, not object
      await page.waitForLoadState('load', this.config.timeout);
    } catch {
      // ignore load timeout
    }

    await this.waitForListings(page, Math.min(this.config.timeout, 15000));
    await this.warmListingGrid(page);
    await this.maybeCaptureScreenshot();

    const listings = await this.extractListingsLocal(page, params.currency || 'USD');
    await this.maybeCaptureScreenshot();
    return listings.slice(0, 10);
  }

  private async searchAirbnbLocalByUrl(page: Page, params: SearchParams): Promise<Listing[]> {
    const searchUrl = this.buildSearchUrl(params);

    try {
      // Use simpler goto API - Stagehand may not support all Playwright options
      await page.goto(searchUrl);
      await this.delay(2000); // Wait for initial load
    } catch (error) {
      logger.error('mcp', 'browserbase_goto_failed', {
        url: searchUrl,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    try {
      // Stagehand Page API may expect timeout as number, not object
      await page.waitForLoadState('networkidle', this.config.timeout);
    } catch {
      // ignore network idle timeouts
    }

    await this.delay(2000);
    await this.waitForListings(page, Math.min(this.config.timeout, 15000));
    await this.warmListingGrid(page);
    await this.maybeCaptureScreenshot();

    const listings = await this.extractListingsLocal(page, params.currency || 'USD');
    await this.maybeCaptureScreenshot();
    return listings.slice(0, 10);
  }

  private async extractListingsLocal(page: Page, currency: string): Promise<Listing[]> {
    let listings = this.parseListings(await this.extractListingsFromDom(page), currency);
    if (listings.length > 0 || !this.stagehand) {
      return listings;
    }

    const listingSchema = z.object({
      listings: z.array(
        z.object({
          title: z.string().optional(),
          price: z.union([z.string(), z.number()]).optional(),
          rating: z.union([z.string(), z.number()]).optional(),
          reviewCount: z.union([z.string(), z.number()]).optional(),
          url: z.string().optional(),
          imageUrl: z.string().optional()
        })
      ).optional()
    });

    try {
      const extractResult = await this.stagehand.extract(
        'Extract Airbnb listing cards with title, price per night, rating, review count, URL, and image URL if available.',
        listingSchema,
        { page, timeout: 10000 }
      );
      listings = this.parseListings(extractResult.listings ?? [], currency);
    } catch {
      listings = [];
    }

    if (listings.length === 0) {
      const signals = await this.collectSearchSignals(page);
      if (signals.signals.length > 0 || signals.listingCount === 0) {
        logger.warn('mcp', 'browserbase_search_empty', {
          mode: this.mode,
          listingCount: signals.listingCount,
          signals: signals.signals,
          pageTitle: signals.pageTitle
        });
      }
    }

    return listings;
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

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async waitForListings(page: Page, timeoutMs: number): Promise<number> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const count = await page.evaluate(() => {
        const cards = document.querySelectorAll('[data-testid="card-container"]');
        if (cards.length > 0) return cards.length;
        return document.querySelectorAll('a[href*="/rooms/"]').length;
      });
      if (count > 0) return count;
      await this.delay(500);
    }
    return 0;
  }

  private async warmListingGrid(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const target = Math.min(document.body.scrollHeight, window.innerHeight * 2);
      let scrolled = 0;
      while (scrolled < target) {
        window.scrollBy(0, 400);
        scrolled += 400;
        await delay(150);
      }
      window.scrollTo(0, 0);
    });
  }

  private async waitForVisible(page: Page, selector: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await page.locator(selector).isVisible()) {
          return true;
        }
      } catch {
        // ignore selector errors
      }
      await this.delay(300);
    }
    return false;
  }

  private async extractListingsFromDom(page: Page): Promise<Array<Record<string, unknown>>> {
    return page.evaluate(() => {
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
    });
  }

  private async collectSearchSignals(page: Page): Promise<{ signals: string[]; listingCount: number; pageTitle: string }> {
    return page.evaluate(() => {
      const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
      const bodyText = normalize(document.body?.innerText || '');
      const combined = `${document.title} ${bodyText}`.toLowerCase();
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
      if (combined.includes('no results') || combined.includes('no exact matches') || combined.includes('try removing some filters')) {
        signals.push('no_results');
      }

      const listingCount = document.querySelectorAll('[data-testid="card-container"]').length;
      return {
        signals,
        listingCount,
        pageTitle: document.title || ''
      };
    });
  }

  private parseListings(content: unknown, currency: string): Listing[] {
    // Parse the extracted content into Listing objects
    // This will depend on the structure returned by the extract tool
    const listings: Listing[] = [];

    try {
      const data = Array.isArray(content) ? content : [content];

      for (const item of data) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const record = item as Record<string, unknown>;
        const title = typeof record.title === 'string' ? record.title : '';
        const priceRaw = this.resolveListingPrice(record);
        const url = typeof record.url === 'string' ? this.normalizeUrl(record.url) : '';
        const imageUrl = typeof record.imageUrl === 'string' ? record.imageUrl : null;
        if (title && priceRaw) {
          listings.push({
            title,
            pricePerNight: this.parsePrice(priceRaw),
            currency: currency,
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

  private parsePrice(priceStr: string): number {
    // Extract numeric value from price string (e.g., "$123" -> 123)
    const match = priceStr.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(/,/g, '')) : 0;
  }

  private resolveListingPrice(record: Record<string, unknown>): string {
    if ('price' in record) return toStringValue(record.price);
    if ('pricePerNight' in record) return toStringValue(record.pricePerNight);
    if ('priceText' in record) return toStringValue(record.priceText);
    if ('pricePerNightText' in record) return toStringValue(record.pricePerNightText);
    return '';
  }

  async getListingDetails(url: string): Promise<ListingDetail> {
    if (!this.connected) {
      throw new Error('Browserbase adapter not connected');
    }

    if (this.mode === 'local') {
      return this.getListingDetailsLocal(url);
    }

    return this.getListingDetailsCloud(url);
  }

  private async getListingDetailsCloud(url: string): Promise<ListingDetail> {
    if (!this.client) {
      throw new Error('Browserbase adapter not connected');
    }

    try {
      // Navigate to listing detail page
      const navigateResult = await this.client.callTool({
        name: 'browserbase_stagehand_navigate',
        arguments: { url }
      });
      this.assertToolSuccess(navigateResult, 'Navigate to listing detail page');

      // Wait for page to load
      await this.delay(2000);

      // Extract listing details and reviews
      const extractResult = await this.client.callTool({
        name: 'browserbase_stagehand_extract',
        arguments: {
          instruction: 'Extract listing title, price per night, rating, review count, and up to 15 review texts with author names and dates'
        }
      });
      this.assertToolSuccess(extractResult, 'Extract listing details');

      // Parse the extracted data
      return this.parseListingDetail(extractResult.content, url);
    } catch (error) {
      throw new Error(`Failed to get listing details: ${error}`);
    }
  }

  private async getListingDetailsLocal(url: string): Promise<ListingDetail> {
    if (!this.stagehand) {
      throw new Error('Browserbase adapter not connected');
    }

    const detailPage = await this.stagehand.context.newPage();

    try {
      // Use simpler goto API - Stagehand may not support all Playwright options
      await detailPage.goto(url);
      await this.delay(2000); // Wait for initial load
    } catch (error) {
      logger.error('mcp', 'browserbase_detail_goto_failed', {
        url,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    try {
      // Stagehand Page API may expect timeout as number, not object
      await detailPage.waitForLoadState('networkidle', this.config.timeout);
    } catch {
      // ignore network idle timeout
    }

    await this.delay(1500);

    const detailSchema = z.object({
      title: z.string().optional(),
      price: z.union([z.string(), z.number()]).optional(),
      currency: z.string().optional(),
      rating: z.union([z.string(), z.number()]).optional(),
      reviewCount: z.union([z.string(), z.number()]).optional(),
      imageUrl: z.string().optional(),
      description: z.string().optional(),
      reviews: z.array(
        z.object({
          text: z.string().optional(),
          author: z.string().optional(),
          date: z.string().optional()
        })
      ).optional()
    });

    try {
      const extractResult = await this.stagehand.extract(
        'Extract listing title, price per night, currency, rating, review count, primary image URL, short description, and up to 15 reviews with text, author, and date.',
        detailSchema,
        { page: detailPage }
      );

      return this.parseListingDetail(extractResult, url);
    } catch (error) {
      const fallbackDetail = await detailPage.evaluate(() => {
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

        const reviewBlocks = Array.from(document.querySelectorAll('[data-testid="review"]')).slice(0, 15);
        const reviews = reviewBlocks.map((block) => {
          const text = normalize(block.querySelector('[data-testid="review-text"]')?.textContent || '');
          const author = normalize(block.querySelector('[data-testid="review-avatar-name"]')?.textContent || '');
          const date = normalize(block.querySelector('time')?.textContent || '');
          return { text, author, date };
        }).filter(review => review.text);

        const title = getText('h1');
        const price = getText('[data-testid="book-it-price"]')
          || getText('[data-testid="price"]')
          || getMeta('og:price:amount')
          || '';
        const currency = getMeta('og:price:currency') || '';
        const rating = getText('[data-testid="review-score"]') || '';
        const reviewCount = getText('[data-testid="review-count"]')
          || normalize(document.querySelector('a[href*="#reviews"]')?.textContent || '');
        const imageUrl = getMeta('og:image')
          || document.querySelector('img[src*="airbnb"]')?.getAttribute('src')
          || '';
        const description = getMeta('og:description')
          || getMeta('description')
          || '';

        return {
          title,
          price,
          currency,
          rating,
          reviewCount,
          imageUrl,
          description,
          reviews
        };
      });

      return this.parseListingDetail(fallbackDetail, url);
    } finally {
      await detailPage.close().catch(() => undefined);
    }
  }

  private parseListingDetail(content: unknown, url: string): ListingDetail {
    const record = content && typeof content === 'object' ? (content as Record<string, unknown>) : {};
    const reviews: Review[] = [];

    // Parse reviews from extracted content
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
      pricePerNight: priceValue ? this.parsePrice(priceValue) : 0,
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

  async getMultipleListingDetails(urls: string[]): Promise<ListingDetail[]> {
    if (this.mode === 'local') {
      return this.getMultipleListingDetailsLocal(urls);
    }

    // Limit concurrency to 3 as per requirements
    const results: ListingDetail[] = [];
    const batchSize = 3;

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((url) => this.getListingDetails(url))
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async getMultipleListingDetailsLocal(urls: string[]): Promise<ListingDetail[]> {
    const results: ListingDetail[] = [];
    const batchSize = 3;

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((url) => this.getListingDetailsLocal(url))
      );
      results.push(...batchResults);
    }

    return results;
  }

  private assertToolSuccess(result: { isError?: boolean; content?: unknown }, action: string): void {
    if (!result?.isError) return;
    const detail = extractToolText(result.content);
    throw new Error(detail ? `${action} failed: ${detail}` : `${action} failed`);
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
  return texts.join(' ').trim();
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
