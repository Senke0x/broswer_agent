import { chromium, Browser, BrowserContext, Page, ElementHandle } from 'playwright';
import { logger } from '@/lib/utils/logger';

interface BrowserControllerConfig {
  headless: boolean;
  onScreenshot?: (base64: string) => void;
  onStatus?: (status: string) => void;
}

export class BrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BrowserControllerConfig;

  constructor(config: BrowserControllerConfig) {
    this.config = config;
  }

  async initialize() {
    if (this.browser) return;

    logger.info('browser', 'launching_browser', { headless: this.config.headless });
    
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // Container friendly
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    this.page = await this.context.newPage();
    
    // Inject global styles for our cursor/highlight
    await this.page.addInitScript(() => {
      const style = document.createElement('style');
      style.innerHTML = `
        .manus-cursor {
          position: absolute;
          width: 20px;
          height: 20px;
          background: rgba(255, 0, 0, 0.5);
          border: 2px solid red;
          border-radius: 50%;
          pointer-events: none;
          z-index: 999999;
          transition: all 0.2s ease;
          box-shadow: 0 0 10px rgba(255,0,0,0.5);
        }
        .manus-highlight {
          outline: 2px solid #2563eb !important;
          outline-offset: 2px !important;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.2) !important;
          transition: all 0.2s ease;
        }
      `;
      document.head.appendChild(style);
    });
  }

  async close() {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  // --- Core Actions with Visualization ---

  async goto(url: string) {
    if (!this.page) throw new Error('Browser not initialized');
    
    this.config.onStatus?.(`Navigating to ${new URL(url).hostname}...`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.captureState();
  }

  async click(selector: string, description?: string) {
    if (!this.page) throw new Error('Browser not initialized');

    this.config.onStatus?.(description || `Clicking element...`);
    
    try {
      const element = await this.page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
      if (element) {
        await this.highlightAndCapture(element);
        await element.click();
        await this.page.waitForTimeout(500); // Wait for reaction
        await this.captureState(); // Capture post-click state
      }
    } catch (e) {
      logger.warn('browser', 'click_failed', { selector, error: String(e) });
      // Try force click or JS click if Playwright click fails? 
      // For now, let it throw to handle upstream
      throw e;
    }
  }

  async type(selector: string, text: string, description?: string) {
    if (!this.page) throw new Error('Browser not initialized');

    this.config.onStatus?.(description || `Typing "${text}"...`);

    try {
      const element = await this.page.waitForSelector(selector, { state: 'visible' });
      if (element) {
        await this.highlightAndCapture(element);
        await element.fill(text);
        await this.page.waitForTimeout(300);
        await this.captureState();
      }
    } catch (e) {
      logger.warn('browser', 'type_failed', { selector, error: String(e) });
      throw e;
    }
  }

  async waitForSelector(selector: string, timeout = 5000) {
    if (!this.page) throw new Error('Browser not initialized');
    return this.page.waitForSelector(selector, { timeout });
  }

  async getPage() {
    return this.page;
  }

  // --- Visual Helpers ---

  /**
   * Highlights an element, takes a screenshot, then removes highlight
   */
  private async highlightAndCapture(element: ElementHandle) {
    if (!this.page) return;

    // 1. Add Highlight Class
    await element.evaluate((el) => {
      (el as HTMLElement).classList.add('manus-highlight');
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // 2. Add Cursor (Fake visual)
    const box = await element.boundingBox();
    if (box) {
      await this.page.evaluate(({ x, y, width, height }) => {
        const cursor = document.createElement('div');
        cursor.className = 'manus-cursor';
        cursor.style.left = `${x + width / 2}px`;
        cursor.style.top = `${y + height / 2}px`;
        cursor.id = 'active-manus-cursor';
        document.body.appendChild(cursor);
      }, box);
    }

    // 3. Capture Screenshot
    await this.captureState();

    // 4. Clean up visual aids
    await this.page.evaluate(() => {
      const cursor = document.getElementById('active-manus-cursor');
      if (cursor) cursor.remove();
      const highlighted = document.querySelector('.manus-highlight');
      if (highlighted) highlighted.classList.remove('manus-highlight');
    });
  }

  /**
   * Takes a screenshot and sends it to the callback
   */
  async captureState() {
    if (!this.page || !this.config.onScreenshot) return;
    
    try {
      const buffer = await this.page.screenshot({ 
        quality: 60, 
        type: 'jpeg',
        fullPage: false 
      });
      const base64 = buffer.toString('base64');
      this.config.onScreenshot(`data:image/jpeg;base64,${base64}`);
    } catch (e) {
      logger.warn('browser', 'screenshot_failed', { error: String(e) });
    }
  }
  
  async evaluate<T>(fn: (arg: unknown) => T, arg?: unknown): Promise<T> {
      if (!this.page) throw new Error('Browser not initialized');
      return this.page.evaluate(fn, arg);
  }
  
  async count(selector: string): Promise<number> {
      if (!this.page) return 0;
      return this.page.locator(selector).count();
  }
}
