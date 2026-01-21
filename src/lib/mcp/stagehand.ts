// Stagehand MCP Adapter (Local)

import { MCPAdapter, MCPConfig } from '@/types/mcp';
import { SearchParams, Listing, ListingDetail } from '@/types/listing';
import { logger } from '@/lib/utils/logger';
import { Stagehand, Page } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { parseListingDetail, parseListings } from './browserbase-utils';

type BrowserbaseConfig = MCPConfig['browserbase'];
type StagehandConfig = Omit<BrowserbaseConfig, 'apiKey' | 'projectId' | 'mode'> & {
  apiKey?: string;
  projectId?: string;
  mode?: 'local' | 'cloud';
};
type StagehandLocator = ReturnType<Page['locator']>;

const AIRBNB_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const AIRBNB_WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

export class StagehandAdapter implements MCPAdapter {
  readonly name = 'browserbase' as const;

  private stagehand: Stagehand | null = null;
  private page: Page | null = null;
  private config: StagehandConfig;
  private connected = false;
  private screenshotCallback?: (base64: string) => void;

  constructor(config: StagehandConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    await this.connectLocal();
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
        // 配置模型以支持 observe/act 功能
        // 需要设置 OPENAI_API_KEY 环境变量
        model: 'openai/gpt-4.1-mini',
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

      try {
        await this.injectVisualFeedback();
      } catch (error) {
        logger.warn('mcp', 'browserbase_visual_feedback_failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to local Chrome via Stagehand: ${error}`);
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
    if (!this.page) return;

    // Visual feedback hook intentionally disabled for Stagehand compatibility.
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.stagehand?.close();
      this.stagehand = null;
      this.page = null;
      this.connected = false;
    } catch (error) {
      throw new Error(`Failed to disconnect from Stagehand: ${error}`);
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

    const page = await this.getLocalPage();
    const buffer = await page.screenshot({ fullPage: true, type: 'png' });
    const base64 = buffer.toString('base64');
    if (this.screenshotCallback) {
      this.screenshotCallback(base64);
      return null;
    }
    return base64;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const page = await this.getLocalPage();
      await page.title();
      return true;
    } catch {
      return false;
    }
  }

  async searchAirbnb(params: SearchParams): Promise<Listing[]> {
    if (!this.connected) {
      throw new Error('Stagehand adapter not connected');
    }

    return this.searchAirbnbLocal(params);
  }

  private async searchAirbnbLocal(params: SearchParams): Promise<Listing[]> {
    if (!this.stagehand) {
      throw new Error('Stagehand adapter not connected');
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H5',location:'stagehand.ts:searchAirbnbLocal:entry',message:'searchAirbnbLocal entry',data:{timeoutMs:this.config.timeout,connected:this.connected,hasStagehand:!!this.stagehand,params:{location:params.location,checkIn:params.checkIn,checkOut:params.checkOut,guests:params.guests,budgetMin:params.budgetMin,budgetMax:params.budgetMax}},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    try {
      const page = await this.getLocalPage();
      let uiListings: Listing[] | null = null;
      const uiStart = Date.now();
      try {
        uiListings = await this.searchAirbnbLocalUi(page, params);
      } catch (error) {
        logger.warn('mcp', 'browserbase_ui_flow_failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4',location:'stagehand.ts:searchAirbnbLocal:ui_result',message:'searchAirbnbLocal ui result',data:{uiListingsNull:uiListings === null,uiListingsCount:uiListings ? uiListings.length : 0,uiDurationMs:Date.now() - uiStart},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (uiListings && uiListings.length > 0) {
        return uiListings;
      }

      logger.info('mcp', 'browserbase_ui_fallback', {
        reason: uiListings ? 'no_listings' : 'ui_unavailable'
      });
      throw new Error('Stagehand UI search failed or returned no listings');
    } catch (error) {
      logger.error('mcp', 'browserbase_search_local_failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  private async searchAirbnbLocalUi(page: Page, params: SearchParams): Promise<Listing[] | null> {
    const homeUrl = 'https://www.airbnb.com.sg/';
    const gotoStart = Date.now();
    this.logUiAction('goto_home', 'start', { url: homeUrl });
    try {
      await this.withTimeout(
        page.goto(homeUrl, {
          waitUntil: 'domcontentloaded',
          timeoutMs: this.config.timeout
        }),
        this.config.timeout + 5000,
        'ui_goto_home'
      );
      this.logUiAction('goto_home', 'success', {
        url: homeUrl,
        durationMs: Date.now() - gotoStart
      });
      await this.delay(200); // 减少延迟
    } catch (error) {
      this.logUiAction('goto_home', 'fail', {
        url: homeUrl,
        durationMs: Date.now() - gotoStart,
        error: error instanceof Error ? error.message : String(error)
      });
      logger.warn('mcp', 'browserbase_goto_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }

    const waitStart = Date.now();
    this.logUiAction('wait_for_load_state', 'start', {
      state: 'domcontentloaded',
      timeoutMs: Math.min(this.config.timeout, 8000)
    });
    try {
      const waitTimeoutMs = Math.min(this.config.timeout, 8000);
      await this.withTimeout(
        page.waitForLoadState('domcontentloaded', waitTimeoutMs),
        waitTimeoutMs + 1000,
        'ui_wait_domcontentloaded'
      );
      this.logUiAction('wait_for_load_state', 'success', {
        state: 'domcontentloaded',
        durationMs: Date.now() - waitStart
      });
    } catch (error) {
      this.logUiAction('wait_for_load_state', 'fail', {
        state: 'domcontentloaded',
        durationMs: Date.now() - waitStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1',location:'stagehand.ts:searchAirbnbLocalUi:post_wait',message:'post goto/wait',data:{gotoDurationMs:Date.now() - gotoStart,waitDurationMs:Date.now() - waitStart,timeoutMs:this.config.timeout},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    await this.delay(100); // 减少延迟
    await this.maybeCaptureScreenshot();

    logger.info('mcp', 'browserbase_ui_step', {
      step: 'location',
      location: params.location
    });

    const locationSelector = 'input[id="bigsearch-query-location-input"]';
    const locationInput = await this.findVisibleLocator(page, locationSelector, 10000);
    this.logUiAction('find_location_input', locationInput ? 'success' : 'fail', {
      selector: locationSelector,
      timeoutMs: 10000
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2',location:'stagehand.ts:searchAirbnbLocalUi:location_input',message:'location input lookup',data:{found:!!locationInput,selector:locationSelector},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!locationInput) {
      logger.warn('mcp', 'browserbase_ui_location_missing');
      return null;
    }

    if (!(await this.safeClick(locationInput, { step: 'location', selector: locationSelector }))) {
      logger.warn('mcp', 'browserbase_ui_location_click_failed');
      return null;
    }
    await this.delay(200); // 减少延迟
    if (!(await this.safeFill(locationInput, params.location, { step: 'location', selector: locationSelector }))) {
      logger.warn('mcp', 'browserbase_ui_location_fill_failed');
      return null;
    }
    await this.delay(300); // 减少延迟

    // #region agent log
    const preTabState = await this.evaluateScript<{
      href: string;
      cardCount: number;
      roomsLinkCount: number;
      hasSaveButton: boolean;
      hasDateField: boolean;
      locationValueLength: number;
    }>(page, String.raw`(() => {
      const input = document.querySelector('input[id="bigsearch-query-location-input"]');
      return {
        href: window.location.href || '',
        cardCount: document.querySelectorAll('[data-testid="card-container"]').length,
        roomsLinkCount: document.querySelectorAll('a[href*="/rooms/"]').length,
        hasSaveButton: !!document.querySelector('[data-testid="listing-card-save-button"]'),
        hasDateField: !!document.querySelector('[data-testid*="structured-search-input-field-dates"], [data-testid*="structured-search-input-field-split-dates"]'),
        locationValueLength: (input && input.value ? String(input.value).length : 0)
      };
    })()`, 'pre_tab_state');
    fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H8',location:'stagehand.ts:searchAirbnbLocalUi:pre_tab',message:'state before tab',data:preTabState,timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // 不使用 Tab，改为点击 "When/日期" 入口以打开日期面板
    await this.delay(200);
    const whenLabels = [
      'when',
      'add dates',
      'dates',
      'check in',
      'check-in',
      'check out',
      'checkout',
      '日期',
      '入住',
      '退房',
      '指定',
      '时间'
    ];
    const whenClicked = await this.clickButtonByText(page, whenLabels, 'open_dates_after_location');
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H15',location:'stagehand.ts:searchAirbnbLocalUi:open_dates_after_location',message:'click when/add dates after location',data:{whenClicked},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    await this.delay(300); // 等待面板切换动画

    // Calendar post-tab logging removed.

    await this.maybeCaptureScreenshot();

    // 快速检测是否意外跳转到搜索结果页
    const resultsProbe = await this.evaluateScript<{
      href: string;
      hasSaveButton: boolean;
      cardCount: number;
      roomsLinkCount: number;
    }>(page, String.raw`(() => {
      return {
        href: window.location.href || '',
        hasSaveButton: !!document.querySelector('[data-testid="listing-card-save-button"]'),
        cardCount: document.querySelectorAll('[data-testid="card-container"]').length,
        roomsLinkCount: document.querySelectorAll('a[href*="/rooms/"]').length
      };
    })()`, 'check_results_page');
    let isSearchPath = false;
    try {
      const url = new URL(resultsProbe.href);
      isSearchPath = url.pathname.includes('/s/') || url.pathname.startsWith('/homes');
    } catch {
      isSearchPath = resultsProbe.href.includes('/s/') || resultsProbe.href.includes('/homes');
    }
    const isOnResultsPage = isSearchPath
      && (resultsProbe.hasSaveButton || resultsProbe.cardCount > 0 || resultsProbe.roomsLinkCount > 0);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H10',location:'stagehand.ts:searchAirbnbLocalUi:results_probe',message:'results page probe',data:{href:resultsProbe.href,hasSaveButton:resultsProbe.hasSaveButton,cardCount:resultsProbe.cardCount,roomsLinkCount:resultsProbe.roomsLinkCount,isSearchPath,isOnResultsPage},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (isOnResultsPage) {
      this.logUiAction('results_page_detection', 'fail', {
        reason: 'page_navigated_to_results_before_date_selection'
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H11',location:'stagehand.ts:searchAirbnbLocalUi:results_detected',message:'results detected before dates',data:{href:resultsProbe.href,hasSaveButton:resultsProbe.hasSaveButton,cardCount:resultsProbe.cardCount,roomsLinkCount:resultsProbe.roomsLinkCount},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw new Error('Page navigated to search results before completing date/guest selection. Location input may have triggered immediate search.');
    }

    logger.info('mcp', 'browserbase_ui_step', {
      step: 'dates',
      checkIn: params.checkIn,
      checkOut: params.checkOut
    });

    // Calendar preselect logging removed.

    const datePickerSelectors = [
      'button[data-testid="structured-search-input-field-dates"]',
      'button[data-testid="structured-search-input-field-split-dates-0"]',
      'div[data-testid="structured-search-input-field-split-dates-0"]',
      'div[data-testid="structured-search-input-field-split-dates-1"]',
      'button[data-testid="structured-search-input-field-checkin"]',
      'button[data-testid="structured-search-input-field-checkout"]',
      'button[data-testid*="structured-search-input-field-split-dates"]',
      'div[data-testid*="structured-search-input-field-split-dates"]',
      'button[data-testid*="structured-search-input-field-dates"]',
      'div[data-testid="structured-search-input-field-dates"]',
      'div[data-testid*="structured-search-input-field-dates"]',
      'div[data-testid="structured-search-input-field-dates"] button',
      'div[data-testid*="structured-search-input-field-dates"] button',
      'button[aria-label*="When" i]',
      'button[aria-label*="Add dates" i]',
      'button[aria-label*="Check in" i]',
      'button[aria-label*="Check-in" i]',
      'button[aria-label*="Check out" i]',
      'button[aria-label*="Checkout" i]',
      'div[aria-label*="Check in" i]',
      'div[aria-label*="Check out" i]',
      'input[name="checkin"]',
      'input[name="checkout"]',
      'input[aria-label*="Check in" i]',
      'input[aria-label*="Check out" i]'
    ];

    const datePicker = await this.findFirstVisibleLocator(page, datePickerSelectors, 8000, 'date_picker');
    if (!datePicker) {
      logger.warn('mcp', 'browserbase_ui_date_picker_missing');
      await this.logUiContext(page, 'date_picker_missing');
      const openDateLabels = [
        'dates',
        'check in',
        'check-in',
        'check out',
        'checkout',
        'when',
        'add dates',
        '\u65e5\u671f',
        '\u5165\u4f4f',
        '\u9000\u623f',
        '\u6307\u5b9a',
        '灵活'
      ];
      const opened = await this.clickButtonByText(page, openDateLabels, 'open_date_picker');
      let advanced = false;
      if (opened) {
        await this.delay(400); // 减少延迟
      } else {
        const advanceLabels = ['next', 'continue', '下一步', '继续'];
        advanced = await this.clickButtonByText(page, advanceLabels, 'advance_to_dates');
        if (advanced) {
          await this.delay(400); // 减少延迟
        }
      }
      await this.maybeCaptureScreenshot();
    } else {
      logger.info('mcp', 'browserbase_ui_locator', {
        step: 'date_picker',
        selector: datePicker.selector
      });
      const clicked = await this.safeClick(datePicker.locator, {
        step: 'date_picker',
        selector: datePicker.selector
      });
      if (!clicked) {
        logger.warn('mcp', 'browserbase_ui_date_picker_click_failed');
      }
      await this.delay(400); // 减少延迟
    }

    const calendarVisible = await this.ensureCalendarVisible(page);
    if (!calendarVisible) {
      logger.warn('mcp', 'browserbase_ui_calendar_not_visible');
      await this.logUiContext(page, 'calendar_not_visible');
      await this.maybeCaptureScreenshot();
      return null;
    }

    const checkInSelected = await this.selectCalendarDate(page, params.checkIn, 24, 'checkin');
    if (!checkInSelected) {
      logger.warn('mcp', 'browserbase_ui_checkin_failed', { checkIn: params.checkIn });
      await this.logUiContext(page, 'checkin_failed');
      await this.maybeCaptureScreenshot();
      return null;
    }
    await this.delay(200); // 减少延迟

    const checkOutSelected = await this.selectCalendarDate(page, params.checkOut, 24, 'checkout');
    if (!checkOutSelected) {
      logger.warn('mcp', 'browserbase_ui_checkout_failed', { checkOut: params.checkOut });
      await this.logUiContext(page, 'checkout_failed');
      await this.maybeCaptureScreenshot();
      return null;
    }
    await this.delay(200); // 减少延迟
    await this.maybeCaptureScreenshot();

    logger.info('mcp', 'browserbase_ui_step', {
      step: 'guests',
      guests: params.guests
    });

    const calendarOverlayOpen = await this.evaluateScript<boolean>(page, String.raw`(() => {
      return !!document.querySelector('[data-testid*="expanded-searchbar-dates-"]')
        || !!document.querySelector('[data-testid*="calendar-day"]')
        || !!document.querySelector('[data-testid^="calendar-day-"]');
    })()`, 'calendar_overlay_probe');
    if (calendarOverlayOpen) {
      this.logUiAction('press_key', 'start', { key: 'Escape', step: 'close_calendar_before_guests' });
      try {
        await page.keyPress('Escape');
        this.logUiAction('press_key', 'success', { key: 'Escape', step: 'close_calendar_before_guests' });
      } catch (error) {
        this.logUiAction('press_key', 'fail', {
          key: 'Escape',
          step: 'close_calendar_before_guests',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      await this.delay(300);
    }
    // Calendar overlay post-close logging removed.

    // #region agent log
    const guestSurface = await this.evaluateScript<{
      href: string;
      guestButtons: Array<{ text: string; ariaLabel: string; testId: string }>;
      stepperCount: number;
      increaseButtons: number;
      guestFieldCount: number;
      guestFieldVisibleCount: number;
    }>(page, String.raw`(() => {
      const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity || '1') === 0) return false;
        return el.getClientRects().length > 0;
      };
      const guestButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
        .map((el) => ({
          text: normalize(el.textContent || ''),
          ariaLabel: normalize(el.getAttribute('aria-label') || ''),
          testId: normalize(el.getAttribute('data-testid') || '')
        }))
        .filter((item) => {
          const hay = (item.text + ' ' + item.ariaLabel + ' ' + item.testId).toLowerCase();
          return hay.includes('guest') || hay.includes('guests') || hay.includes('who') || hay.includes('住客') || hay.includes('人数') || hay.includes('旅客') || hay.includes('客人');
        })
        .slice(0, 6);
      const stepperCount = document.querySelectorAll('[data-testid*="stepper"], [role="group"]').length;
      const increaseButtons = document.querySelectorAll('button[aria-label*="increase" i], button[aria-label*="add" i], button[data-testid*="increase"], button[data-testid*="increment"]').length;
      const guestFields = Array.from(document.querySelectorAll('[data-testid*="structured-search-input-field-guests"], [data-testid*="structured-search-input-field-guest"]'));
      const guestFieldCount = guestFields.length;
      const guestFieldVisibleCount = guestFields.filter((el) => isVisible(el)).length;
      return { href: window.location.href || '', guestButtons, stepperCount, increaseButtons, guestFieldCount, guestFieldVisibleCount };
    })()`, 'guest_surface_probe');
    fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H24',location:'stagehand.ts:searchAirbnbLocalUi:guest_surface',message:'guest surface probe',data:guestSurface,timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    let guestFieldVisibleCount = guestSurface.guestFieldVisibleCount;
    let guestFieldCount = guestSurface.guestFieldCount;

    if (guestFieldVisibleCount === 0) {
      const isResultsPage = guestSurface.href.includes('/s/') || guestSurface.href.includes('/homes');
      if (isResultsPage) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H42',location:'stagehand.ts:searchAirbnbLocalUi:results_search_open_attempt',message:'try open results search panel (little-search)',data:{href:guestSurface.href},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const resultsSearchSelectors = [
          'button[data-testid="little-search"]',
          'div[data-testid="little-search"]',
          '*[data-testid="little-search"]',
          'button[data-testid="little-search-location"]',
          'button[data-testid="little-search-date"]'
        ];
        const resultsSearch = await this.findFirstVisibleLocator(page, resultsSearchSelectors, 3000, 'results_search_panel');
        if (resultsSearch) {
          await this.safeClick(resultsSearch.locator, { step: 'results_search_panel', selector: resultsSearch.selector });
          await this.delay(300);
        }
        // #region agent log
        const resultsSearchState = await this.evaluateScript<{
          guestFieldCount: number;
          guestFieldVisibleCount: number;
        }>(page, String.raw`(() => {
          const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (parseFloat(style.opacity || '1') === 0) return false;
            return el.getClientRects().length > 0;
          };
          const guestFields = Array.from(document.querySelectorAll('[data-testid*="structured-search-input-field-guests"], [data-testid*="structured-search-input-field-guest"]'));
          const guestFieldCount = guestFields.length;
          const guestFieldVisibleCount = guestFields.filter((el) => isVisible(el)).length;
          return { guestFieldCount, guestFieldVisibleCount };
        })()`, 'results_search_panel_state');
        fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H43',location:'stagehand.ts:searchAirbnbLocalUi:results_search_panel_state',message:'results search panel state after click',data:resultsSearchState,timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        guestFieldVisibleCount = resultsSearchState.guestFieldVisibleCount;
        guestFieldCount = resultsSearchState.guestFieldCount;
      }

      const expandSelectors = [
        'div[data-testid="structured-search-input-field-query"]',
        'button[data-testid="structured-search-input-field-query"]',
        'div[data-testid*="structured-search-input-field-location"]',
        'button[data-testid*="structured-search-input-field-location"]',
        'input[id="bigsearch-query-location-input"]'
      ];
      const expandTarget = await this.findFirstVisibleLocator(page, expandSelectors, 4000, 'expand_search_for_guests');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H30',location:'stagehand.ts:searchAirbnbLocalUi:expand_search_for_guests',message:'expand search bar for guests',data:{found:!!expandTarget,selector:expandTarget?.selector || ''},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (expandTarget) {
        await this.safeClick(expandTarget.locator, { step: 'expand_search_for_guests', selector: expandTarget.selector });
        await this.delay(300);
      }
      if (!isResultsPage && guestFieldVisibleCount === 0) {
        let guestsSetInline = false;
        await this.clickButtonByText(
          page,
          ['guests', 'guest', 'who', 'add guests', '住客', '人数', '旅客', '客人', '成人'],
          'open_guest_picker_inline'
        );
        await this.delay(300);
        const inlineGuestUi = await this.evaluateScript<{
          dialogCount: number;
          guestContainers: Array<{ tag: string; testId: string; ariaLabel: string; text: string }>;
          expandedButtons: Array<{ ariaLabel: string; ariaControls: string; text: string }>;
          iframeCount: number;
          shadowHostCount: number;
        }>(page, String.raw`(() => {
          const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
          const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (parseFloat(style.opacity || '1') === 0) return false;
            return el.getClientRects().length > 0;
          };
          const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [data-testid*="modal"]'));
          const guestContainers = Array.from(document.querySelectorAll('[data-testid*="guest"], [data-testid*="guests"]'))
            .filter((el) => isVisible(el))
            .slice(0, 3)
            .map((el) => ({
              tag: (el.tagName || '').toLowerCase(),
              testId: normalize(el.getAttribute('data-testid') || ''),
              ariaLabel: normalize(el.getAttribute('aria-label') || ''),
              text: normalize(el.textContent || '').slice(0, 80)
            }));
          const expandedButtons = Array.from(document.querySelectorAll('button[aria-expanded="true"]'))
            .slice(0, 3)
            .map((el) => ({
              ariaLabel: normalize(el.getAttribute('aria-label') || ''),
              ariaControls: normalize(el.getAttribute('aria-controls') || ''),
              text: normalize(el.textContent || '').slice(0, 60)
            }));
          const iframeCount = document.querySelectorAll('iframe').length;
          const shadowHostCount = Array.from(document.querySelectorAll('*')).filter((el) => el.shadowRoot).length;
          return { dialogCount: dialogs.length, guestContainers, expandedButtons, iframeCount, shadowHostCount };
        })()`, 'inline_guest_ui_snapshot');
        logger.info('mcp', 'browserbase_ui_guest_debug', {
          label: 'inline_guest_ui_snapshot',
          ...inlineGuestUi
        });
        // #region agent log
        const inlineAdultsProbe = await this.evaluateScript<{
          visibleAdultsCount: number;
          plusButtons: number;
          samples: Array<{ text: string; ariaLabel: string; testId: string }>;
        }>(page, String.raw`(() => {
          const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
          const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (parseFloat(style.opacity || '1') === 0) return false;
            return el.getClientRects().length > 0;
          };
          const adultsNodes = Array.from(document.querySelectorAll('*'))
            .filter((el) => isVisible(el))
            .filter((el) => {
              const text = normalize(el.textContent || '').toLowerCase();
              return text === 'adults' || text === '成人';
            });
          const plusButtons = Array.from(document.querySelectorAll('button[aria-label*="increase" i], button[aria-label*="add" i], button[data-testid*="increase"], button[data-testid*="increment"]'))
            .filter((el) => isVisible(el)).length;
          const samples = adultsNodes.slice(0, 3).map((el) => ({
            text: normalize(el.textContent || ''),
            ariaLabel: normalize(el.getAttribute('aria-label') || ''),
            testId: normalize(el.getAttribute('data-testid') || '')
          }));
          return { visibleAdultsCount: adultsNodes.length, plusButtons, samples };
        })()`, 'inline_adults_probe');
        fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H49',location:'stagehand.ts:searchAirbnbLocalUi:inline_adults_probe',message:'adults probe right after open_guest_picker_inline',data:inlineAdultsProbe,timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (inlineAdultsProbe.visibleAdultsCount > 0 || inlineAdultsProbe.plusButtons > 0) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H50',location:'stagehand.ts:searchAirbnbLocalUi:inline_guest_set_attempt',message:'attempt set guests after inline adults visible',data:{visibleAdultsCount:inlineAdultsProbe.visibleAdultsCount,plusButtons:inlineAdultsProbe.plusButtons,targetGuests:params.guests},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          const guestsSetInlineResult = await this.setGuestCount(page, params.guests);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H50',location:'stagehand.ts:searchAirbnbLocalUi:inline_guest_set_result',message:'set guests after inline adults result',data:{success:guestsSetInlineResult},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (guestsSetInlineResult) {
            guestFieldVisibleCount = inlineAdultsProbe.visibleAdultsCount;
          }
          guestsSetInline = guestsSetInlineResult;
        } else {
          const adultsPanelVisible = await this.waitForGuestPanel(page, 3000);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H50',location:'stagehand.ts:searchAirbnbLocalUi:inline_guest_panel_wait',message:'wait for adults panel after open_guest_picker_inline',data:{visible:adultsPanelVisible},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (adultsPanelVisible) {
            const guestsSetInlineResult = await this.setGuestCount(page, params.guests);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H50',location:'stagehand.ts:searchAirbnbLocalUi:inline_guest_set_result',message:'set guests after inline panel wait',data:{success:guestsSetInlineResult},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if (guestsSetInlineResult) {
              guestFieldVisibleCount = 1;
            }
            guestsSetInline = guestsSetInlineResult;
          } else {
            const inlineGuestVisibility = await this.evaluateScript<{
              topElement: { tag: string; id: string; className: string; ariaLabel: string };
              guestCandidates: Array<{ tag: string; testId: string; ariaLabel: string; visible: boolean }>;
              iframeCount: number;
              shadowHostCount: number;
            }>(page, String.raw`(() => {
              const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
              const isVisible = (el) => {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                if (parseFloat(style.opacity || '1') === 0) return false;
                return el.getClientRects().length > 0;
              };
              const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
              const topElement = center ? {
                tag: (center.tagName || '').toLowerCase(),
                id: center.id || '',
                className: center.className ? String(center.className).slice(0, 80) : '',
                ariaLabel: normalize(center.getAttribute('aria-label') || '')
              } : { tag: '', id: '', className: '', ariaLabel: '' };
              const guestCandidates = Array.from(document.querySelectorAll('[data-testid*="guest"], [data-testid*="guests"], [role="dialog"]'))
                .slice(0, 4)
                .map((el) => ({
                  tag: (el.tagName || '').toLowerCase(),
                  testId: normalize(el.getAttribute('data-testid') || ''),
                  ariaLabel: normalize(el.getAttribute('aria-label') || ''),
                  visible: isVisible(el)
                }));
              const iframeCount = document.querySelectorAll('iframe').length;
              const shadowHostCount = Array.from(document.querySelectorAll('*')).filter((el) => el.shadowRoot).length;
              return { topElement, guestCandidates, iframeCount, shadowHostCount };
            })()`, 'inline_guest_visibility');
            logger.info('mcp', 'browserbase_ui_guest_debug', {
              label: 'inline_guest_panel_not_visible',
              ...inlineGuestVisibility
            });
          }
        }

        if (!guestsSetInline && guestFieldVisibleCount === 0) {
          const headerSearchSelectors = [
            'button[data-testid="little-search"]',
            'div[data-testid="little-search"]',
            '*[data-testid="little-search"]',
            'button[aria-label*="Start your search" i]',
            'button[aria-label*="Edit search" i]'
          ];
          const headerSearch = await this.findFirstVisibleLocator(page, headerSearchSelectors, 4000, 'header_search_open');
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H50',location:'stagehand.ts:searchAirbnbLocalUi:header_search_open',message:'attempt open header search before guests',data:{found:!!headerSearch,selector:headerSearch?.selector || ''},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (headerSearch) {
            await this.safeClick(headerSearch.locator, { step: 'header_search_open', selector: headerSearch.selector });
            await this.delay(300);
            await this.clickButtonByText(
              page,
              ['guests', 'guest', 'who', 'add guests', '住客', '人数', '旅客', '客人', '成人'],
              'open_guest_picker_header'
            );
            await this.delay(300);
            const headerGuestPanelVisible = await this.waitForGuestPanel(page, 4000);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H50',location:'stagehand.ts:searchAirbnbLocalUi:header_guest_panel_wait',message:'wait for adults panel after header search open',data:{visible:headerGuestPanelVisible},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if (headerGuestPanelVisible) {
              const headerGuestsSet = await this.setGuestCount(page, params.guests);
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H50',location:'stagehand.ts:searchAirbnbLocalUi:header_guest_set_result',message:'set guests after header search open',data:{success:headerGuestsSet},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
              if (headerGuestsSet) {
                guestFieldVisibleCount = 1;
              }
            }
          } else {
            const headerSearchCandidates = await this.evaluateScript<Array<{
              tag: string;
              testId: string;
              ariaLabel: string;
              text: string;
            }>>(page, String.raw`(() => {
              const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
              const isVisible = (el) => {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                if (parseFloat(style.opacity || '1') === 0) return false;
                return el.getClientRects().length > 0;
              };
              const candidates = Array.from(document.querySelectorAll('button, [role="button"]'))
                .filter((el) => isVisible(el))
                .map((el) => ({
                  tag: (el.tagName || '').toLowerCase(),
                  testId: normalize(el.getAttribute('data-testid') || ''),
                  ariaLabel: normalize(el.getAttribute('aria-label') || ''),
                  text: normalize(el.textContent || '').slice(0, 60)
                }))
                .filter((item) => {
                  const hay = (item.testId + ' ' + item.ariaLabel + ' ' + item.text).toLowerCase();
                  return hay.includes('search') || hay.includes('edit') || hay.includes('guest') || hay.includes('who');
                })
                .slice(0, 8);
              return candidates;
            })()`, 'header_search_candidates');
            logger.info('mcp', 'browserbase_ui_guest_debug', {
              label: 'header_search_candidates',
              candidates: headerSearchCandidates
            });
          }
        }

        if (!guestsSetInline && guestFieldVisibleCount === 0 && inlineGuestUi.iframeCount > 0) {
          const frameGuestsSet = await this.trySetGuestsInFrames(page, params.guests);
          logger.info('mcp', 'browserbase_ui_guest_debug', {
            label: 'frame_guest_set_attempt',
            iframeCount: inlineGuestUi.iframeCount,
            success: frameGuestsSet
          });
          if (frameGuestsSet) {
            guestFieldVisibleCount = 1;
          }
        }
      }
      // #region agent log
      const guestSurfaceRetry = await this.evaluateScript<{
        guestFieldCount: number;
        guestFieldVisibleCount: number;
      }>(page, String.raw`(() => {
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const guestFields = Array.from(document.querySelectorAll('[data-testid*="structured-search-input-field-guests"], [data-testid*="structured-search-input-field-guest"]'));
        const guestFieldCount = guestFields.length;
        const guestFieldVisibleCount = guestFields.filter((el) => isVisible(el)).length;
        return { guestFieldCount, guestFieldVisibleCount };
      })()`, 'guest_surface_retry');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H31',location:'stagehand.ts:searchAirbnbLocalUi:guest_surface_retry',message:'guest surface retry after expand',data:guestSurfaceRetry,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      guestFieldVisibleCount = guestSurfaceRetry.guestFieldVisibleCount;
      guestFieldCount = guestSurfaceRetry.guestFieldCount;
    }

    let advancedToGuests = false;
    if (guestFieldVisibleCount === 0) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H34',location:'stagehand.ts:searchAirbnbLocalUi:advance_to_guests_pre',message:'attempt advance to guests when guest field not visible',data:{guestFieldVisibleCount},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      advancedToGuests = await this.clickButtonByText(
        page,
        ['next', 'continue', '下一步', '继续'],
        'advance_to_guests_pre'
      );
      // #region agent log
      const guestSurfaceAfterAdvance = await this.evaluateScript<{
        guestFieldCount: number;
        guestFieldVisibleCount: number;
      }>(page, String.raw`(() => {
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const guestFields = Array.from(document.querySelectorAll('[data-testid*="structured-search-input-field-guests"], [data-testid*="structured-search-input-field-guest"]'));
        const guestFieldCount = guestFields.length;
        const guestFieldVisibleCount = guestFields.filter((el) => isVisible(el)).length;
        return { guestFieldCount, guestFieldVisibleCount };
      })()`, 'guest_surface_after_advance');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H33',location:'stagehand.ts:searchAirbnbLocalUi:guest_surface_after_advance',message:'guest surface after advance',data:{advancedToGuests,...guestSurfaceAfterAdvance},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (advancedToGuests) {
        await this.delay(300);
      }
    }

    const guestPickerSelectors = [
      '*[data-testid="structured-search-input-field-guests"]',
      '*[data-testid*="structured-search-input-field-guests"]',
      'button[data-testid="structured-search-input-field-guests"]',
      'div[data-testid="structured-search-input-field-guests"]',
      'div[data-testid="structured-search-input-field-guests"] button',
      '*[data-testid*="guests"]',
      '*[data-testid*="guest"]',
      'button[data-testid*="guest"]',
      'div[data-testid*="guest"]',
      'button[aria-label*="Who" i]',
      'button[aria-label*="Guests" i]',
      'button[aria-label*="Add guests" i]',
      'div[aria-label*="Who" i]',
      'div[aria-label*="Guests" i]',
      'input[aria-label*="Who" i]',
      'input[aria-label*="Guests" i]'
    ];
    let guestPicker = await this.findFirstVisibleLocator(page, guestPickerSelectors, 6000, 'guest_picker');
    if (!guestPicker) {
      logger.warn('mcp', 'browserbase_ui_guest_picker_missing');
      await this.logUiContext(page, 'guest_picker_missing');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H35',location:'stagehand.ts:searchAirbnbLocalUi:guest_picker_missing',message:'guest picker missing before open attempts',data:{guestFieldVisibleCount,advancedToGuests},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      const guestPickerState = await this.evaluateScript<{
        modalCount: number;
        dialogCount: number;
        stepperCount: number;
        increaseButtons: number;
      }>(page, String.raw`(() => {
        const modalCount = document.querySelectorAll('[role="dialog"], [data-testid*="modal"]').length;
        const dialogCount = document.querySelectorAll('[role="dialog"]').length;
        const stepperCount = document.querySelectorAll('[data-testid*="stepper"], [role="group"]').length;
        const increaseButtons = document.querySelectorAll('button[aria-label*="increase" i], button[aria-label*="add" i], button[data-testid*="increase"], button[data-testid*="increment"]').length;
        return { modalCount, dialogCount, stepperCount, increaseButtons };
      })()`, 'guest_picker_missing_probe');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H25',location:'stagehand.ts:searchAirbnbLocalUi:guest_picker_missing',message:'guest picker missing probe',data:guestPickerState,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const openGuestLabels = [
        'guests',
        'guest',
        'who',
        'add guests',
        '\u4f4f\u5ba2',
        '\u4eba\u6570',
        '\u65c5\u5ba2',
        '\u5ba2\u4eba',
        '成人'
      ];
      const opened = await this.clickButtonByText(page, openGuestLabels, 'open_guest_picker');
      // #region agent log
      const guestDialogAfterOpen = await this.evaluateScript<{
        dialogCount: number;
        stepperCount: number;
        increaseButtons: number;
      }>(page, String.raw`(() => {
        const dialogCount = document.querySelectorAll('[role="dialog"], [data-testid*="modal"]').length;
        const stepperCount = document.querySelectorAll('[data-testid*="stepper"], [role="group"]').length;
        const increaseButtons = document.querySelectorAll('button[aria-label*="increase" i], button[aria-label*="add" i], button[data-testid*="increase"], button[data-testid*="increment"]').length;
        return { dialogCount, stepperCount, increaseButtons };
      })()`, 'guest_dialog_after_open');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H29',location:'stagehand.ts:searchAirbnbLocalUi:guest_dialog_after_open',message:'guest dialog after open',data:{opened,dialogCount:guestDialogAfterOpen.dialogCount,stepperCount:guestDialogAfterOpen.stepperCount,increaseButtons:guestDialogAfterOpen.increaseButtons},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      const guestPanelCandidates = await this.evaluateScript<{
        visibleGuestNodes: number;
        visibleIncreaseButtons: number;
        samples: Array<{
          tag: string;
          testId: string;
          ariaLabel: string;
          text: string;
        }>;
      }>(page, String.raw`(() => {
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const guestNodes = Array.from(document.querySelectorAll('[data-testid*="guest"], [data-testid*="guests"], [aria-label*="guest" i], [aria-label*="who" i]'));
        const visibleGuestNodes = guestNodes.filter((el) => isVisible(el)).length;
        const increaseButtons = Array.from(document.querySelectorAll('button[aria-label*="increase" i], button[aria-label*="add" i], button[data-testid*="increase"], button[data-testid*="increment"]'));
        const visibleIncreaseButtons = increaseButtons.filter((el) => isVisible(el)).length;
        const samples = guestNodes.filter((el) => isVisible(el)).slice(0, 4).map((el) => ({
          tag: (el.tagName || '').toLowerCase(),
          testId: normalize(el.getAttribute('data-testid') || ''),
          ariaLabel: normalize(el.getAttribute('aria-label') || ''),
          text: normalize(el.textContent || '').slice(0, 80)
        }));
        return { visibleGuestNodes, visibleIncreaseButtons, samples };
      })()`, 'guest_panel_candidates');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H44',location:'stagehand.ts:searchAirbnbLocalUi:guest_panel_candidates',message:'guest panel candidates after open_guest_picker',data:guestPanelCandidates,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      const guestPanelScope = await this.evaluateScript<{
        foundWhoNode: boolean;
        scopeTag: string;
        scopeTestId: string;
        scopeRole: string;
        adultsLabels: string[];
        increaseButtons: Array<{ ariaLabel: string; testId: string; text: string }>;
      }>(page, String.raw`(() => {
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const candidates = Array.from(document.querySelectorAll('button, [role="button"], [data-testid*="guest"], [data-testid*="guests"]'))
          .filter((el) => isVisible(el))
          .filter((el) => {
            const text = normalize(el.textContent || '').toLowerCase();
            const aria = normalize(el.getAttribute('aria-label') || '').toLowerCase();
            const testId = normalize(el.getAttribute('data-testid') || '').toLowerCase();
            return text.includes('who') || text.includes('guests') || aria.includes('guests') || testId.includes('guests');
          });
        const whoNode = candidates[0] || null;
        let scope = whoNode;
        for (let i = 0; i < 6 && scope; i += 1) {
          const testId = (scope.getAttribute && scope.getAttribute('data-testid')) || '';
          const role = (scope.getAttribute && scope.getAttribute('role')) || '';
          if (String(testId).includes('structured-search') || role === 'dialog') break;
          scope = scope.parentElement;
        }
        const scopeEl = scope || whoNode || document.body;
        const adultsLabels = Array.from(scopeEl.querySelectorAll('[aria-label*="adult" i], [aria-label*="Adults" i], [data-testid*="adult"]'))
          .map((el) => normalize(el.getAttribute('aria-label') || el.textContent || ''))
          .filter(Boolean)
          .slice(0, 6);
        const increaseButtons = Array.from(scopeEl.querySelectorAll('button[aria-label*="increase" i], button[aria-label*="add" i], button[data-testid*="increase"], button[data-testid*="increment"]'))
          .filter((el) => isVisible(el))
          .slice(0, 6)
          .map((el) => ({
            ariaLabel: normalize(el.getAttribute('aria-label') || ''),
            testId: normalize(el.getAttribute('data-testid') || ''),
            text: normalize(el.textContent || '')
          }));
        return {
          foundWhoNode: !!whoNode,
          scopeTag: scopeEl ? (scopeEl.tagName || '').toLowerCase() : '',
          scopeTestId: scopeEl ? normalize(scopeEl.getAttribute('data-testid') || '') : '',
          scopeRole: scopeEl ? normalize(scopeEl.getAttribute('role') || '') : '',
          adultsLabels,
          increaseButtons
        };
      })()`, 'guest_panel_scope');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H45',location:'stagehand.ts:searchAirbnbLocalUi:guest_panel_scope',message:'guest panel scope near who button',data:guestPanelScope,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      const adultsPanelProbe = await this.evaluateScript<{
        visibleAdultsCount: number;
        samples: Array<{ text: string; containerTestId: string; containerRole: string; plusButtons: number }>;
      }>(page, String.raw`(() => {
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const adultsNodes = Array.from(document.querySelectorAll('*'))
          .filter((el) => isVisible(el))
          .filter((el) => normalize(el.textContent || '').toLowerCase() === 'adults');
        const samples = adultsNodes.slice(0, 3).map((node) => {
          let container = node;
          for (let i = 0; i < 5 && container; i += 1) {
            const role = container.getAttribute && container.getAttribute('role');
            const testId = container.getAttribute && container.getAttribute('data-testid');
            if (role === 'dialog' || String(testId).includes('guest') || String(testId).includes('guests')) break;
            container = container.parentElement;
          }
          const containerEl = container || node;
          const plusButtons = containerEl.querySelectorAll('button[aria-label*="increase" i], button[aria-label*="add" i], button[data-testid*="increase"], button[data-testid*="increment"]').length;
          return {
            text: normalize(node.textContent || ''),
            containerTestId: normalize(containerEl.getAttribute('data-testid') || ''),
            containerRole: normalize(containerEl.getAttribute('role') || ''),
            plusButtons
          };
        });
        return { visibleAdultsCount: adultsNodes.length, samples };
      })()`, 'adults_panel_probe');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H46',location:'stagehand.ts:searchAirbnbLocalUi:adults_panel_probe',message:'adults panel probe after open_guest_picker',data:adultsPanelProbe,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      const adultsPanelWaitStart = Date.now();
      let adultsPanelVisible = false;
      try {
        const adultsLocator = await this.findVisibleLocator(page, 'text=Adults', 2000);
        const adultsCnLocator = await this.findVisibleLocator(page, 'text=成人', 2000);
        adultsPanelVisible = Boolean(adultsLocator || adultsCnLocator);
      } catch {
        adultsPanelVisible = false;
      }
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H47',location:'stagehand.ts:searchAirbnbLocalUi:adults_panel_wait',message:'wait for adults panel after open_guest_picker',data:{visible:adultsPanelVisible,durationMs:Date.now() - adultsPanelWaitStart},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (adultsPanelVisible) {
        // #region agent log
        const adultsPanelDetails = await this.evaluateScript<{
          count: number;
          samples: Array<{ text: string; plusButtons: number; containerTestId: string; containerRole: string }>;
        }>(page, String.raw`(() => {
          const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
          const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (parseFloat(style.opacity || '1') === 0) return false;
            return el.getClientRects().length > 0;
          };
          const matches = Array.from(document.querySelectorAll('*'))
            .filter((el) => isVisible(el))
            .filter((el) => {
              const text = normalize(el.textContent || '').toLowerCase();
              return text === 'adults' || text === '成人';
            });
          const samples = matches.slice(0, 3).map((node) => {
            let container = node;
            for (let i = 0; i < 5 && container; i += 1) {
              const role = container.getAttribute && container.getAttribute('role');
              const testId = container.getAttribute && container.getAttribute('data-testid');
              if (role === 'dialog' || String(testId).includes('guest') || String(testId).includes('guests')) break;
              container = container.parentElement;
            }
            const containerEl = container || node;
            const plusButtons = containerEl.querySelectorAll('button[aria-label*="increase" i], button[aria-label*="add" i], button[data-testid*="increase"], button[data-testid*="increment"]').length;
            return {
              text: normalize(node.textContent || ''),
              plusButtons,
              containerTestId: normalize(containerEl.getAttribute('data-testid') || ''),
              containerRole: normalize(containerEl.getAttribute('role') || '')
            };
          });
          return { count: matches.length, samples };
        })()`, 'adults_panel_details');
        fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H48',location:'stagehand.ts:searchAirbnbLocalUi:adults_panel_details',message:'adults panel details after wait',data:adultsPanelDetails,timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      }
      if (opened) {
        await this.delay(400); // 减少延迟
        guestPicker = await this.findFirstVisibleLocator(page, guestPickerSelectors, 6000, 'guest_picker_retry');
      }

      if (!guestPicker) {
        const openedByTestId = await this.clickByTestIdContains(
          page,
          ['guest', 'guests', 'who'],
          'open_guest_picker_testid'
        );
        if (openedByTestId) {
          await this.delay(400); // 减少延迟
          guestPicker = await this.findFirstVisibleLocator(page, guestPickerSelectors, 6000, 'guest_picker_retry');
        }
      }

      if (!guestPicker) {
        const advanceLabels = ['next', 'continue', '下一步', '继续'];
        const advanced = await this.clickButtonByText(page, advanceLabels, 'advance_to_guests');
        if (advanced) {
          await this.delay(400); // 减少延迟
          guestPicker = await this.findFirstVisibleLocator(page, guestPickerSelectors, 6000, 'guest_picker_retry');
        }
      }

      if (!guestPicker) {
        this.logUiAction('press_key', 'start', { key: 'Escape', step: 'guest_picker_escape' });
        try {
          await page.keyPress('Escape');
          this.logUiAction('press_key', 'success', { key: 'Escape', step: 'guest_picker_escape' });
        } catch (error) {
          this.logUiAction('press_key', 'fail', {
            key: 'Escape',
            step: 'guest_picker_escape',
            error: error instanceof Error ? error.message : String(error)
          });
        }
        await this.delay(300); // 减少延迟
        guestPicker = await this.findFirstVisibleLocator(page, guestPickerSelectors, 6000, 'guest_picker_escape_retry');
      }
    }
    let guestsSet = false;
    if (!guestPicker) {
      logger.warn('mcp', 'browserbase_ui_guest_picker_missing_skip', { guests: params.guests });
      await this.maybeCaptureScreenshot();
    } else {
      logger.info('mcp', 'browserbase_ui_locator', {
        step: 'guest_picker',
        selector: guestPicker.selector
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H36',location:'stagehand.ts:searchAirbnbLocalUi:guest_picker_found',message:'guest picker found before click',data:{selector:guestPicker.selector},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      const guestPickerDetails = await this.evaluateScript<{
        href: string;
        matchCount: number;
        firstMatch?: {
          tag: string;
          text: string;
          ariaLabel: string;
          testId: string;
          role: string;
        };
      }>(page, String.raw`(() => {
        const selector = ${JSON.stringify(guestPicker.selector)};
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const matches = Array.from(document.querySelectorAll(selector));
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const visible = matches.filter((el) => isVisible(el));
        const first = visible[0] || matches[0];
        const firstMatch = first ? {
          tag: (first.tagName || '').toLowerCase(),
          text: normalize(first.textContent || ''),
          ariaLabel: normalize(first.getAttribute('aria-label') || ''),
          testId: normalize(first.getAttribute('data-testid') || ''),
          role: normalize(first.getAttribute('role') || '')
        } : undefined;
        return { href: window.location.href || '', matchCount: matches.length, firstMatch };
      })()`, 'guest_picker_details');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H37',location:'stagehand.ts:searchAirbnbLocalUi:guest_picker_details',message:'guest picker details before click',data:guestPickerDetails,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      const headerSearchControls = await this.evaluateScript<{
        href: string;
        candidates: Array<{
          tag: string;
          role: string;
          testId: string;
          ariaLabel: string;
          text: string;
        }>;
      }>(page, String.raw`(() => {
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const elements = Array.from(document.querySelectorAll('[data-testid*="little-search"], [data-testid*="search"], button, [role="button"]'));
        const candidates = elements
          .filter((el) => isVisible(el))
          .map((el) => {
            const testId = normalize(el.getAttribute('data-testid') || '');
            const ariaLabel = normalize(el.getAttribute('aria-label') || '');
            const text = normalize(el.textContent || '');
            const role = normalize(el.getAttribute('role') || '');
            const tag = (el.tagName || '').toLowerCase();
            return { tag, role, testId, ariaLabel, text };
          })
          .filter((item) => {
            const hay = (item.testId + ' ' + item.ariaLabel + ' ' + item.text).toLowerCase();
            return hay.includes('little-search') || hay.includes('search') || hay.includes('edit') || hay.includes('guest') || hay.includes('who');
          })
          .slice(0, 12);
        return { href: window.location.href || '', candidates };
      })()`, 'header_search_controls');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H41',location:'stagehand.ts:searchAirbnbLocalUi:header_search_controls',message:'header search controls candidates',data:headerSearchControls,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!(await this.safeClick(guestPicker.locator, {
        step: 'guest_picker',
        selector: guestPicker.selector
      }))) {
        logger.warn('mcp', 'browserbase_ui_guest_picker_click_failed');
      } else {
        await this.delay(300); // 减少延迟
      }

      // #region agent log
      const guestPickerAfterClick = await this.evaluateScript<{
        href: string;
        ariaExpanded: string;
        ariaControls: string;
        popoverCount: number;
        guestPanelVisibleCount: number;
        adultsLabelCount: number;
      }>(page, String.raw`(() => {
        const selector = ${JSON.stringify(guestPicker.selector)};
        const button = document.querySelector(selector);
        const ariaExpanded = button ? (button.getAttribute('aria-expanded') || '') : '';
        const ariaControls = button ? (button.getAttribute('aria-controls') || '') : '';
        const popoverCount = document.querySelectorAll('[data-testid*="guest"], [data-testid*="guests"], [role="dialog"], [role="listbox"]').length;
        const guestPanelVisibleCount = Array.from(document.querySelectorAll('[data-testid*="guest"], [data-testid*="guests"]')).filter((el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        }).length;
        const adultsLabelCount = document.querySelectorAll('button[aria-label*="adult" i], [aria-label*="Adults" i]').length;
        return { href: window.location.href || '', ariaExpanded, ariaControls, popoverCount, guestPanelVisibleCount, adultsLabelCount };
      })()`, 'guest_picker_after_click');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H39',location:'stagehand.ts:searchAirbnbLocalUi:guest_picker_after_click',message:'guest picker state after click',data:guestPickerAfterClick,timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      const guestPanelVisible = await this.waitForGuestPanel(page, 4000);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H26',location:'stagehand.ts:searchAirbnbLocalUi:guest_panel_wait',message:'guest panel wait result',data:{visible:guestPanelVisible},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      const guestPanelProbe = await this.evaluateScript<{
        href: string;
        dialogCount: number;
        stepperCount: number;
        increaseButtons: number;
        adultsButtonCount: number;
      }>(page, String.raw`(() => {
        const dialogCount = document.querySelectorAll('[role="dialog"], [data-testid*="modal"]').length;
        const stepperCount = document.querySelectorAll('[data-testid*="stepper"], [role="group"]').length;
        const increaseButtons = document.querySelectorAll('button[aria-label*="increase" i], button[aria-label*="add" i], button[data-testid*="increase"], button[data-testid*="increment"]').length;
        const adultsButtonCount = document.querySelectorAll('button[aria-label*="Adults" i], button[aria-label*="adult" i]').length;
        return { href: window.location.href || '', dialogCount, stepperCount, increaseButtons, adultsButtonCount };
      })()`, 'guest_panel_probe');
      fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H38',location:'stagehand.ts:searchAirbnbLocalUi:guest_panel_probe',message:'guest panel probe after click',data:guestPanelProbe,timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (guestPanelVisible) {
        guestsSet = await this.setGuestCount(page, params.guests);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3',location:'stagehand.ts:searchAirbnbLocalUi:guests',message:'guest count set',data:{guests:params.guests,success:guestsSet},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (!guestsSet) {
          logger.warn('mcp', 'browserbase_ui_guest_count_failed', { guests: params.guests });
        }
      } else {
        // #region agent log
        const guestPanelContext = await this.evaluateScript<{
          href: string;
          visibleCount: number;
          samples: Array<{
            tag: string;
            role: string;
            testId: string;
            ariaLabel: string;
            text: string;
            buttonLabels: string[];
            buttonTestIds: string[];
          }>;
        }>(page, String.raw`(() => {
          const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
          const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (parseFloat(style.opacity || '1') === 0) return false;
            return el.getClientRects().length > 0;
          };
          const containers = Array.from(document.querySelectorAll('[data-testid*="guest"], [data-testid*="guests"], [role="dialog"], [role="listbox"], [role="menu"]'));
          const visible = containers.filter((el) => isVisible(el));
          const samples = visible.slice(0, 2).map((el) => {
            const buttons = Array.from(el.querySelectorAll('button')).slice(0, 8);
            const buttonLabels = buttons
              .map((btn) => normalize(btn.getAttribute('aria-label') || btn.textContent || ''))
              .filter(Boolean);
            const buttonTestIds = buttons
              .map((btn) => normalize(btn.getAttribute('data-testid') || ''))
              .filter(Boolean);
            return {
              tag: (el.tagName || '').toLowerCase(),
              role: normalize(el.getAttribute('role') || ''),
              testId: normalize(el.getAttribute('data-testid') || ''),
              ariaLabel: normalize(el.getAttribute('aria-label') || ''),
              text: normalize(el.textContent || '').slice(0, 120),
              buttonLabels,
              buttonTestIds
            };
          });
          return { href: window.location.href || '', visibleCount: visible.length, samples };
        })()`, 'guest_panel_context');
        fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H40',location:'stagehand.ts:searchAirbnbLocalUi:guest_panel_context',message:'guest panel context when not visible',data:guestPanelContext,timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        logger.warn('mcp', 'browserbase_ui_guest_panel_not_visible_skip');
      }
    }
    await this.maybeCaptureScreenshot();

    logger.info('mcp', 'browserbase_ui_step', { step: 'search' });

    const searchButtonSelectors = [
      'button[data-testid="structured-search-input-search-button"]',
      '*[data-testid="structured-search-input-search-button"]',
      'button[data-testid*="search-button"]',
      '*[data-testid*="search-button"]',
      'button[aria-label*="Search" i]',
      'button[aria-label*="Find" i]'
    ];
    const searchButton = await this.findFirstVisibleLocator(page, searchButtonSelectors, 5000, 'search_button');
    this.logUiAction('find_search_button', searchButton ? 'success' : 'fail', {
      selector: searchButton ? searchButton.selector : searchButtonSelectors[0],
      timeoutMs: 5000
    });
    let searchClicked = false;
    if (searchButton) {
      searchClicked = await this.safeClick(searchButton.locator, {
        step: 'search',
        selector: searchButton.selector
      });
    }

    if (!searchClicked) {
      const clickedByText = await this.clickButtonByText(
        page,
        ['search', '\u641c\u7d22'],
        'search_by_text'
      );
      searchClicked = clickedByText;
    }

    if (!searchClicked) {
      const jsClickStart = Date.now();
      const searchSelector = 'button[data-testid="structured-search-input-search-button"]';
      this.logUiAction('search_button_js_click', 'start', { selector: searchSelector });
      try {
        const script = String.raw`(() => {
          const buttons = Array.from(document.querySelectorAll('[data-testid="structured-search-input-search-button"]'));
          const target = buttons.find((button) => {
            const style = window.getComputedStyle(button);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return button.getClientRects().length > 0;
          });
          if (target) target.click();
        })()`;
        await this.evaluateScript(page, script, 'search_button_js_click');
        this.logUiAction('search_button_js_click', 'success', {
          selector: searchSelector,
          durationMs: Date.now() - jsClickStart
        });
        searchClicked = true;
      } catch (error) {
        this.logUiAction('search_button_js_click', 'fail', {
          selector: searchSelector,
          durationMs: Date.now() - jsClickStart,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3',location:'stagehand.ts:searchAirbnbLocalUi:search_click',message:'search click result',data:{searchClicked},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!searchClicked) {
      await this.logUiContext(page, 'search_button_missing');
      const searchSurface = await this.evaluateScript<{
        href: string;
        visibleButtons: Array<{ text: string; ariaLabel: string; testId: string; role: string; tag: string }>;
      }>(page, String.raw`(() => {
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
          .filter((el) => isVisible(el))
          .map((el) => ({
            text: normalize(el.textContent || ''),
            ariaLabel: normalize(el.getAttribute('aria-label') || ''),
            testId: normalize(el.getAttribute('data-testid') || ''),
            role: normalize(el.getAttribute('role') || ''),
            tag: (el.tagName || '').toLowerCase()
          }))
          .filter((item) => {
            const hay = (item.text + ' ' + item.ariaLabel + ' ' + item.testId).toLowerCase();
            return hay.includes('search') || hay.includes('\u641c\u7d22');
          })
          .slice(0, 8);
        return { href: window.location.href || '', visibleButtons: buttons };
      })()`, 'search_surface_probe');
      this.logUiAction('search_surface_probe', 'success', searchSurface);
    }

    if (!searchClicked) {
      this.logUiAction('press_key', 'start', { key: 'Escape', step: 'search_escape' });
      try {
        await page.keyPress('Escape');
        this.logUiAction('press_key', 'success', { key: 'Escape', step: 'search_escape' });
      } catch (error) {
        this.logUiAction('press_key', 'fail', {
          key: 'Escape',
          step: 'search_escape',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      await this.delay(400);
      const searchButtonRetry = await this.findFirstVisibleLocator(page, searchButtonSelectors, 5000, 'search_button_retry');
      if (searchButtonRetry) {
        searchClicked = await this.safeClick(searchButtonRetry.locator, {
          step: 'search',
          selector: searchButtonRetry.selector
        });
      }
    }

    const loadStart = Date.now();
    this.logUiAction('wait_for_load_state', 'start', {
      state: 'load',
      timeoutMs: this.config.timeout
    });
    try {
      await this.withTimeout(
        page.waitForLoadState('load', this.config.timeout),
        this.config.timeout + 2000,
        'ui_wait_load'
      );
      this.logUiAction('wait_for_load_state', 'success', {
        state: 'load',
        durationMs: Date.now() - loadStart
      });
    } catch (error) {
      this.logUiAction('wait_for_load_state', 'fail', {
        state: 'load',
        durationMs: Date.now() - loadStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const listingsWaitStart = Date.now();
    this.logUiAction('wait_for_listings', 'start', {
      timeoutMs: Math.min(this.config.timeout, 15000)
    });
    const listingCount = await this.waitForListings(page, Math.min(this.config.timeout, 15000));
    this.logUiAction('wait_for_listings', listingCount > 0 ? 'success' : 'fail', {
      durationMs: Date.now() - listingsWaitStart,
      count: listingCount
    });

    const warmStart = Date.now();
    this.logUiAction('warm_listing_grid', 'start');
    try {
      await this.warmListingGrid(page);
      this.logUiAction('warm_listing_grid', 'success', { durationMs: Date.now() - warmStart });
    } catch (error) {
      this.logUiAction('warm_listing_grid', 'fail', {
        durationMs: Date.now() - warmStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    await this.maybeCaptureScreenshot();

    const extractStart = Date.now();
    this.logUiAction('extract_listings', 'start');
    const listings = await this.extractListingsLocal(page, params.currency || 'USD');
    this.logUiAction('extract_listings', listings.length > 0 ? 'success' : 'fail', {
      durationMs: Date.now() - extractStart,
      count: listings.length
    });
    await this.maybeCaptureScreenshot();
    return listings.slice(0, 10);
  }

  private async searchAirbnbLocalByUrl(page: Page, params: SearchParams): Promise<Listing[]> {
    const searchUrl = this.buildSearchUrl(params);

    const gotoStart = Date.now();
    this.logUiAction('fallback_goto', 'start', { url: searchUrl });
    try {
      await this.withTimeout(
        page.goto(searchUrl, {
          waitUntil: 'domcontentloaded',
          timeoutMs: this.config.timeout
        }),
        this.config.timeout + 5000,
        'fallback_goto'
      );
      this.logUiAction('fallback_goto', 'success', {
        url: searchUrl,
        durationMs: Date.now() - gotoStart
      });
      await this.delay(2000);
    } catch (error) {
      this.logUiAction('fallback_goto', 'fail', {
        url: searchUrl,
        durationMs: Date.now() - gotoStart,
        error: error instanceof Error ? error.message : String(error)
      });
      logger.error('mcp', 'browserbase_goto_failed', {
        url: searchUrl,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    const waitStart = Date.now();
    this.logUiAction('fallback_wait_for_load_state', 'start', {
      state: 'networkidle',
      timeoutMs: this.config.timeout
    });
    try {
      await this.withTimeout(
        page.waitForLoadState('networkidle', this.config.timeout),
        this.config.timeout + 2000,
        'fallback_wait_networkidle'
      );
      this.logUiAction('fallback_wait_for_load_state', 'success', {
        state: 'networkidle',
        durationMs: Date.now() - waitStart
      });
    } catch (error) {
      this.logUiAction('fallback_wait_for_load_state', 'fail', {
        state: 'networkidle',
        durationMs: Date.now() - waitStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    await this.delay(2000);
    const listingsWaitStart = Date.now();
    this.logUiAction('fallback_wait_for_listings', 'start', {
      timeoutMs: Math.min(this.config.timeout, 15000)
    });
    const listingCount = await this.waitForListings(page, Math.min(this.config.timeout, 15000));
    this.logUiAction('fallback_wait_for_listings', listingCount > 0 ? 'success' : 'fail', {
      durationMs: Date.now() - listingsWaitStart,
      count: listingCount
    });

    const warmStart = Date.now();
    this.logUiAction('fallback_warm_listing_grid', 'start');
    try {
      await this.warmListingGrid(page);
      this.logUiAction('fallback_warm_listing_grid', 'success', { durationMs: Date.now() - warmStart });
    } catch (error) {
      this.logUiAction('fallback_warm_listing_grid', 'fail', {
        durationMs: Date.now() - warmStart,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    await this.maybeCaptureScreenshot();

    const extractStart = Date.now();
    this.logUiAction('fallback_extract_listings', 'start');
    const listings = await this.extractListingsLocal(page, params.currency || 'USD');
    this.logUiAction('fallback_extract_listings', listings.length > 0 ? 'success' : 'fail', {
      durationMs: Date.now() - extractStart,
      count: listings.length
    });
    await this.maybeCaptureScreenshot();
    return listings.slice(0, 10);
  }

  private async extractListingsLocal(page: Page, currency: string): Promise<Listing[]> {
    let listings = parseListings(await this.extractListingsFromDom(page), currency);
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
      listings = parseListings(extractResult.listings ?? [], currency);
    } catch {
      listings = [];
    }

    if (listings.length === 0) {
      const signals = await this.collectSearchSignals(page);
      if (signals.signals.length > 0 || signals.listingCount === 0) {
        logger.warn('mcp', 'browserbase_search_empty', {
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

  private logUiAction(
    name: string,
    status: 'start' | 'success' | 'fail',
    metadata?: Record<string, unknown>
  ): void {
    logger.info('mcp', 'browserbase_ui_action', {
      name,
      status,
      ...(metadata ?? {})
    });
  }

  private async evaluateScript<T>(page: Page, script: string, label: string): Promise<T> {
    const start = Date.now();
    this.logUiAction('evaluate', 'start', { label });
    try {
      const result = await page.evaluate(script);
      this.logUiAction('evaluate', 'success', { label, durationMs: Date.now() - start });
      return result as T;
    } catch (error) {
      this.logUiAction('evaluate', 'fail', {
        label,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async logUiContext(page: Page, label: string): Promise<void> {
    this.logUiAction('ui_context', 'start', { label });
    try {
      const tokens = [
        'date',
        'dates',
        'when',
        'check',
        'guest',
        'guests',
        'who',
        'add',
        'next',
        'continue',
        'search',
        '\u65e5\u671f',
        '\u5165\u4f4f',
        '\u9000\u623f',
        '\u7075\u6d3b',
        '\u6307\u5b9a',
        '\u4f4f\u5ba2',
        '\u4eba\u6570',
        '\u65c5\u5ba2',
        '\u5ba2\u4eba',
        '\u6dfb\u52a0',
        '\u641c\u7d22'
      ];
      const script = String.raw`(() => {
        const tokens = ${JSON.stringify(tokens)};
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const truncate = (value, max) => (value.length > max ? value.slice(0, max) + '...' : value);
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const tokenList = tokens.map((token) => token.toLowerCase());
        const matchesTokens = (value) => tokenList.some((token) => value.toLowerCase().includes(token));

        const collect = (selector, limit) => {
          const results = [];
          const elements = Array.from(document.querySelectorAll(selector));
          for (const element of elements) {
            if (results.length >= limit) break;
            if (!isVisible(element)) continue;
            const text = normalize(element.textContent || '');
            const aria = normalize(element.getAttribute('aria-label') || '');
            const testId = normalize(element.getAttribute('data-testid') || '');
            const name = normalize(element.getAttribute('name') || '');
            const id = normalize(element.id || '');
            const role = normalize(element.getAttribute('role') || '');
            const haystack = (text + ' ' + aria + ' ' + testId + ' ' + name + ' ' + id + ' ' + role).trim();
            if (!haystack || !matchesTokens(haystack)) continue;
            results.push({
              text: truncate(text, 80),
              ariaLabel: truncate(aria, 80),
              testId: truncate(testId, 80),
              name: truncate(name, 80),
              id: truncate(id, 80),
              role: truncate(role, 80)
            });
          }
          return results;
        };

        return {
          buttons: collect('button', 12),
          inputs: collect('input, textarea', 8),
          fields: collect('[data-testid*="structured-search-input-field"], [data-testid*="calendar"]', 12)
        };
      })()`;
      const summary = await this.evaluateScript(page, script, `ui_context:${label}`);
      const summaryData = summary && typeof summary === 'object'
        ? (summary as Record<string, unknown>)
        : { summary };

      this.logUiAction('ui_context', 'success', { label, ...summaryData });
    } catch (error) {
      this.logUiAction('ui_context', 'fail', {
        label,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async clickButtonByText(page: Page, labels: string[], label: string): Promise<boolean> {
    const start = Date.now();
    this.logUiAction('click_by_text', 'start', { label, labels });
    try {
      const script = String.raw`(() => {
        const patterns = ${JSON.stringify(labels)};
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const matches = (value) => {
          const text = normalize(value).toLowerCase();
          return patterns.some((pattern) => text.includes(String(pattern).toLowerCase()));
        };

        const buttons = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"]'));
        for (const button of buttons) {
          if (!isVisible(button)) continue;
          const text = normalize(button.textContent || '');
          const aria = normalize(button.getAttribute('aria-label') || '');
          const testId = normalize(button.getAttribute('data-testid') || '');
          const id = normalize(button.id || '');
          if (!matches(text) && !matches(aria) && !matches(testId) && !matches(id)) continue;
          button.click();
          return {
            clicked: true,
            text,
            ariaLabel: aria,
            testId: button.getAttribute('data-testid') || '',
            id: button.id || '',
            tagName: button.tagName ? button.tagName.toLowerCase() : '',
            role: button.getAttribute('role') || ''
          };
        }
        return { clicked: false };
      })()`;
      const result = await this.evaluateScript<{
        clicked?: boolean;
        text?: string;
        ariaLabel?: string;
        testId?: string;
        id?: string;
        tagName?: string;
        role?: string;
      }>(
        page,
        script,
        `click_by_text:${label}`
      );

      if (result && typeof result === 'object' && result.clicked) {
        this.logUiAction('click_by_text', 'success', {
          label,
          durationMs: Date.now() - start,
          text: (result as { text?: string }).text,
          ariaLabel: (result as { ariaLabel?: string }).ariaLabel,
          testId: (result as { testId?: string }).testId,
          id: (result as { id?: string }).id,
          tagName: (result as { tagName?: string }).tagName,
          role: (result as { role?: string }).role
        });
        return true;
      }

      this.logUiAction('click_by_text', 'fail', {
        label,
        durationMs: Date.now() - start,
        reason: 'not_found'
      });
      return false;
    } catch (error) {
      this.logUiAction('click_by_text', 'fail', {
        label,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  private async clickByTestIdContains(page: Page, fragments: string[], label: string): Promise<boolean> {
    const start = Date.now();
    this.logUiAction('click_by_testid', 'start', { label, fragments });
    try {
      const script = String.raw`(() => {
        const fragments = ${JSON.stringify(fragments)};
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parseFloat(style.opacity || '1') === 0) return false;
          return el.getClientRects().length > 0;
        };
        const matches = (value) => {
          const text = normalize(value).toLowerCase();
          if (!text) return false;
          return fragments.some((fragment) => text.includes(String(fragment).toLowerCase()));
        };

        const elements = Array.from(document.querySelectorAll('[data-testid]'));
        for (const element of elements) {
          if (!isVisible(element)) continue;
          const testId = normalize(element.getAttribute('data-testid') || '');
          if (!matches(testId)) continue;
          const target = element.closest('button, [role="button"], [role="tab"]') || element;
          if (!isVisible(target)) continue;
          const text = normalize(target.textContent || '');
          const aria = normalize(target.getAttribute('aria-label') || '');
          target.click();
          return {
            clicked: true,
            testId,
            text,
            ariaLabel: aria,
            tagName: target.tagName ? target.tagName.toLowerCase() : '',
            role: target.getAttribute('role') || ''
          };
        }
        return { clicked: false };
      })()`;

      const result = await this.evaluateScript<{
        clicked?: boolean;
        testId?: string;
        text?: string;
        ariaLabel?: string;
        tagName?: string;
        role?: string;
      }>(page, script, `click_by_testid:${label}`);

      if (result && result.clicked) {
        this.logUiAction('click_by_testid', 'success', {
          label,
          durationMs: Date.now() - start,
          testId: result.testId,
          text: result.text,
          ariaLabel: result.ariaLabel,
          tagName: result.tagName,
          role: result.role
        });
        return true;
      }

      this.logUiAction('click_by_testid', 'fail', {
        label,
        durationMs: Date.now() - start,
        reason: 'not_found'
      });
      return false;
    } catch (error) {
      this.logUiAction('click_by_testid', 'fail', {
        label,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  private async clickCalendarDateByEval(page: Page, dateStr: string, labels: string[]): Promise<boolean> {
    const dateCompact = dateStr.replace(/-/g, '');
    const script = String.raw`(() => {
      const labels = ${JSON.stringify(labels)};
      const dateStr = ${JSON.stringify(dateStr)};
      const dateCompact = ${JSON.stringify(dateCompact)};
      const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity || '1') === 0) return false;
        return el.getClientRects().length > 0;
      };
      const labelList = labels.map((label) => String(label).toLowerCase());
      const matchesLabel = (value) => {
        const text = normalize(value).toLowerCase();
        if (!text) return false;
        return labelList.some((label) => text.includes(label));
      };

      const containers = Array.from(document.querySelectorAll('[data-testid*="calendar"], [role="dialog"]'));
      const scopes = containers.length > 0 ? containers : [document];

      for (const scope of scopes) {
        const nodes = Array.from(scope.querySelectorAll('button, [role="button"]'));
        for (const node of nodes) {
          if (!isVisible(node)) continue;
          const isDisabled = node.getAttribute('aria-disabled') === 'true' || node.hasAttribute('disabled');
          if (isDisabled) continue;
          const aria = normalize(node.getAttribute('aria-label') || '');
          const testId = normalize(node.getAttribute('data-testid') || '');
          const text = normalize(node.textContent || '');
          const hasDate = testId.includes(dateStr) || testId.includes(dateCompact);
          if (!matchesLabel(aria) && !matchesLabel(text) && !hasDate) continue;
          node.click();
          return {
            clicked: true,
            ariaLabel: aria,
            testId,
            text
          };
        }
      }
      return { clicked: false };
    })()`;

    const result = await this.evaluateScript<{ clicked?: boolean; ariaLabel?: string; testId?: string; text?: string }>(
      page,
      script,
      `calendar_date_eval:${dateStr}`
    );

    if (result && result.clicked) {
      this.logUiAction('calendar_date_eval', 'success', {
        date: dateStr,
        ariaLabel: result.ariaLabel,
        testId: result.testId,
        text: result.text
      });
      return true;
    }

    this.logUiAction('calendar_date_eval', 'fail', { date: dateStr });
    return false;
  }

  private async clickCalendarNavByEval(page: Page, direction: 'next' | 'prev'): Promise<boolean> {
    const script = String.raw`(() => {
      const direction = ${JSON.stringify(direction)};
      const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity || '1') === 0) return false;
        return el.getClientRects().length > 0;
      };
      const keywords = direction === 'next'
        ? ['next', 'forward']
        : ['previous', 'prev', 'back'];
      const matches = (value) => {
        const text = normalize(value).toLowerCase();
        if (!text) return false;
        return keywords.some((keyword) => text.includes(keyword));
      };

      const containers = Array.from(document.querySelectorAll('[data-testid*="calendar"], [role="dialog"]'));
      const scopes = containers.length > 0 ? containers : [document];

      for (const scope of scopes) {
        const nodes = Array.from(scope.querySelectorAll('button, [role="button"]'));
        for (const node of nodes) {
          if (!isVisible(node)) continue;
          const isDisabled = node.getAttribute('aria-disabled') === 'true' || node.hasAttribute('disabled');
          if (isDisabled) continue;
          const aria = normalize(node.getAttribute('aria-label') || '');
          const testId = normalize(node.getAttribute('data-testid') || '');
          const text = normalize(node.textContent || '');
          const hasTestId = testId.includes('calendar-nav-next')
            || testId.includes('calendar-nav-prev')
            || testId.includes('calendar-nav-previous');
          if (!matches(aria) && !matches(text) && !hasTestId) continue;
          node.click();
          return {
            clicked: true,
            ariaLabel: aria,
            testId,
            text
          };
        }
      }
      return { clicked: false };
    })()`;

    const result = await this.evaluateScript<{ clicked?: boolean; ariaLabel?: string; testId?: string; text?: string }>(
      page,
      script,
      `calendar_nav_eval:${direction}`
    );

    if (result && result.clicked) {
      this.logUiAction('calendar_nav_eval', 'success', {
        direction,
        ariaLabel: result.ariaLabel,
        testId: result.testId,
        text: result.text
      });
      return true;
    }

    this.logUiAction('calendar_nav_eval', 'fail', { direction });
    return false;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private formatAirbnbDateLabels(dateStr: string): string[] {
    const date = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return [];
    const day = date.getUTCDate();
    const month = AIRBNB_MONTHS[date.getUTCMonth()];
    const weekday = AIRBNB_WEEKDAYS[date.getUTCDay()];
    const year = date.getUTCFullYear();

    return [
      `${day}, ${weekday}, ${month} ${year}.`,
      `${weekday}, ${month} ${day}, ${year}`,
      `${weekday}, ${month} ${day}, ${year}.`,
      `${month} ${day}, ${year}`,
      `${month} ${day}, ${year}.`,
      `${day} ${month} ${year}`
    ];
  }

  private buildDateSelectors(dateStr: string, labels?: string[]): string[] {
    const resolvedLabels = labels ?? this.formatAirbnbDateLabels(dateStr);
    const selectors: string[] = [];
    for (const label of resolvedLabels) {
      selectors.push(`button[aria-label="${label}"]`);
      selectors.push(`[aria-label="${label}"]`);
      selectors.push(`button[aria-label*="${label}"]`);
      selectors.push(`[aria-label*="${label}"]`);
    }
    selectors.push(`button[data-testid="calendar-day-${dateStr}"]`);
    selectors.push(`[data-testid="calendar-day-${dateStr}"]`);
    selectors.push(`button[data-testid="calendar-day-${dateStr.replace(/-/g, '')}"]`);
    selectors.push(`[data-testid="calendar-day-${dateStr.replace(/-/g, '')}"]`);
    return selectors;
  }

  private async findFirstVisibleLocator(
    page: Page,
    selectors: string[],
    timeoutMs: number,
    label?: string
  ): Promise<{ locator: StagehandLocator; selector: string } | null> {
    const perSelector = Math.max(500, Math.floor(timeoutMs / Math.max(1, selectors.length)));
    this.logUiAction('find_first_visible', 'start', {
      label,
      selectorsCount: selectors.length,
      timeoutMs
    });
    for (const selector of selectors) {
      const locator = await this.findVisibleLocator(page, selector, perSelector);
      if (locator) {
        this.logUiAction('find_first_visible', 'success', {
          label,
          selector
        });
        return { locator, selector };
      }
    }
    this.logUiAction('find_first_visible', 'fail', {
      label,
      selectorsCount: selectors.length
    });
    return null;
  }

  private async selectCalendarDate(
    page: Page,
    dateStr: string,
    maxAdvanceMonths: number,
    field?: 'checkin' | 'checkout'
  ): Promise<boolean> {
    const labels = this.formatAirbnbDateLabels(dateStr);
    const selectors = this.buildDateSelectors(dateStr, labels);
    const nextSelectors = [
      'button[aria-label*="Next" i]',
      'button[aria-label*="forward" i]',
      'button[data-testid="calendar-nav-next-button"]',
      'button[data-testid="calendar-nav-next"]'
    ];
    const prevSelectors = [
      'button[aria-label*="Previous" i]',
      'button[aria-label*="Back" i]',
      'button[aria-label*="backward" i]',
      'button[data-testid="calendar-nav-previous-button"]',
      'button[data-testid="calendar-nav-prev-button"]',
      'button[data-testid="calendar-nav-prev"]'
    ];

    const targetDate = new Date(`${dateStr}T00:00:00Z`);
    const now = new Date();
    const monthsDiff = (targetDate.getUTCFullYear() - now.getUTCFullYear()) * 12
      + (targetDate.getUTCMonth() - now.getUTCMonth());
    const direction = monthsDiff >= 0 ? 'next' : 'prev';
    const navSelectors = direction === 'next' ? nextSelectors : prevSelectors;
    const maxSteps = Math.min(Math.max(Math.abs(monthsDiff), 0), maxAdvanceMonths);

    this.logUiAction('select_calendar_date', 'start', {
      date: dateStr,
      monthsDiff,
      direction,
      maxSteps
    });

    const fieldMode = field ?? null;
    if (fieldMode) {
      const modeProbe = await this.evaluateScript<{
        checkinLabels: string[];
        checkoutLabels: string[];
      }>(page, String.raw`(() => {
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim().toLowerCase();
        const labels = Array.from(document.querySelectorAll('button[aria-label], [role="button"][aria-label]'))
          .map((el) => normalize(el.getAttribute('aria-label') || ''))
          .filter(Boolean);
        const checkinLabels = labels.filter((label) => label.includes('check-in') || label.includes('check in')).slice(0, 4);
        const checkoutLabels = labels.filter((label) => label.includes('checkout') || label.includes('check out')).slice(0, 4);
        return { checkinLabels, checkoutLabels };
      })()`, 'calendar_mode_probe');
      const shouldForceCheckin = fieldMode === 'checkin' && modeProbe.checkoutLabels.length > 0;
      const shouldForceCheckout = fieldMode === 'checkout' && modeProbe.checkinLabels.length > 0;
      if (shouldForceCheckin || shouldForceCheckout) {
        await this.ensureCalendarFieldMode(page, fieldMode);
      }
    }

    // Calendar diagnostic logging removed.

    for (let step = 0; step <= maxSteps; step += 1) {
      const dateLocator = await this.findFirstVisibleLocator(page, selectors, 1500, 'calendar_date');
      if (dateLocator) {
        logger.info('mcp', 'browserbase_ui_locator', {
          step: 'calendar_date',
          date: dateStr,
          selector: dateLocator.selector
        });
        const clicked = await this.safeClick(dateLocator.locator, {
          step: 'calendar_date',
          selector: dateLocator.selector,
          date: dateStr
        });
        if (clicked) {
          this.logUiAction('select_calendar_date', 'success', {
            date: dateStr,
            step,
            method: 'locator'
          });
          return true;
        }
      }

      const evalClicked = await this.clickCalendarDateByEval(page, dateStr, labels);
      if (evalClicked) {
        this.logUiAction('select_calendar_date', 'success', {
          date: dateStr,
          step,
          method: 'eval'
        });
        return true;
      }

      if (step >= maxSteps) break;

      const nav = await this.findFirstVisibleLocator(page, navSelectors, 1500, 'calendar_nav');
      let navClicked = false;
      if (nav) {
        logger.info('mcp', 'browserbase_ui_locator', {
          step: 'calendar_nav',
          direction,
          selector: nav.selector
        });
        navClicked = await this.safeClick(nav.locator, {
          step: 'calendar_nav',
          selector: nav.selector,
          direction
        });
      }

      if (!navClicked) {
        const evalNavClicked = await this.clickCalendarNavByEval(page, direction);
        if (!evalNavClicked) {
          logger.warn('mcp', 'browserbase_ui_calendar_nav_missing', {
            date: dateStr,
            direction
          });
          this.logUiAction('select_calendar_date', 'fail', {
            date: dateStr,
            step,
            reason: nav ? 'nav_click_failed' : 'nav_missing'
          });
          return false;
        }
      }
      await this.delay(400);
    }

    logger.warn('mcp', 'browserbase_ui_calendar_date_not_found', {
      date: dateStr,
      labels,
      monthsDiff,
      maxAdvanceMonths
    });
    this.logUiAction('select_calendar_date', 'fail', {
      date: dateStr,
      reason: 'date_not_found',
      monthsDiff,
      maxSteps
    });
    if (this.stagehand) {
      const instruction = field === 'checkout'
        ? `Select ${dateStr} as the check-out date.`
        : `Select ${dateStr} as the check-in date.`;
      const actions = await this.stagehand.observe(instruction, { page });
      if (actions && actions[0]) {
        await this.stagehand.act(actions[0], { page });
        this.logUiAction('select_calendar_date', 'success', {
          date: dateStr,
          method: 'stagehand_act',
          field: field || 'checkin'
        });
        return true;
      }
    }
    return false;
  }

  private async ensureCalendarVisible(page: Page): Promise<boolean> {
    const preHasCalendar = await this.hasCalendarDays(page);
    if (preHasCalendar) return true;

    const calendarTabSelectors = [
      '[data-testid="expanded-searchbar-dates-calendar-tab"]',
      '[data-testid*="dates-calendar-tab"]',
      '[role="tab"][data-testid*="calendar"]',
      '[role="tab"][data-testid*="dates"]'
    ];
    const tabLocator = await this.findFirstVisibleLocator(page, calendarTabSelectors, 3000, 'calendar_tab');
    if (tabLocator) {
      const tabClicked = await this.safeClick(tabLocator.locator, {
        step: 'calendar_tab',
        selector: tabLocator.selector
      });
    } else {
      await this.clickButtonByText(page, ['指定日期', 'dates', 'calendar'], 'calendar_tab_text');
    }

    const postTabHasCalendar = await this.waitForCalendarDays(page, 3000);
    if (postTabHasCalendar) return true;

    if (this.stagehand) {
      try {
        const actions = await this.stagehand.observe('Switch to the specific dates tab in the date picker.', { page });
        if (actions && actions[0]) {
          await this.stagehand.act(actions[0], { page });
        }
      } catch (error) {
      }
    }

    const postActHasCalendar = await this.waitForCalendarDays(page, 3000);
    return postActHasCalendar;
  }

  private async hasCalendarDays(page: Page): Promise<boolean> {
    const script = String.raw`(() => {
      const selectors = [
        '[data-testid*="calendar-day"]',
        '[data-testid^="calendar-day-"]',
        '[data-testid*="calendar"] [role="button"]',
        '[role="grid"] [role="button"]',
        '[role="dialog"] [role="button"]'
      ];
      for (const selector of selectors) {
        if (document.querySelector(selector)) return true;
      }
      const labeledButtons = Array.from(document.querySelectorAll('button[aria-label], [role="button"][aria-label]'));
      const hasDateLabel = labeledButtons.some((el) => {
        const label = String(el.getAttribute('aria-label') || '');
        if (!label) return false;
        return /\\b20\\d{2}\\b/.test(label) && (label.includes(',') || label.includes('年') || label.includes('月'));
      });
      if (hasDateLabel) return true;
      return false;
    })()`;
    return this.evaluateScript<boolean>(page, script, 'calendar_days_probe');
  }

  private async waitForCalendarDays(page: Page, timeoutMs: number): Promise<boolean> {
    try {
      const selectors = [
        '[data-testid*="calendar-day"]',
        '[data-testid^="calendar-day-"]',
        '[data-testid*="calendar"] [role="button"]',
        '[role="grid"] [role="button"]',
        '[role="dialog"] [role="button"]',
        'button[aria-label*="January"]',
        'button[aria-label*="February"]',
        'button[aria-label*="March"]',
        'button[aria-label*="April"]',
        'button[aria-label*="May"]',
        'button[aria-label*="June"]',
        'button[aria-label*="July"]',
        'button[aria-label*="August"]',
        'button[aria-label*="September"]',
        'button[aria-label*="October"]',
        'button[aria-label*="November"]',
        'button[aria-label*="December"]',
        'button[aria-label*="202"]'
      ];
      const calendarLocator = await this.findFirstVisibleLocator(page, selectors, timeoutMs, 'calendar_wait');
      return !!calendarLocator;
    } catch {
      return false;
    }
  }

  private async ensureCalendarFieldMode(
    page: Page,
    field: 'checkin' | 'checkout'
  ): Promise<void> {
    const selectors = field === 'checkin'
      ? [
          'button[data-testid="structured-search-input-field-checkin"]',
          'button[data-testid="structured-search-input-field-split-dates-0"]',
          'div[data-testid="structured-search-input-field-split-dates-0"]',
          'button[aria-label*="Check in" i]',
          'button[aria-label*="Check-in" i]',
          'input[name="checkin"]',
          'input[aria-label*="Check in" i]'
        ]
      : [
          'button[data-testid="structured-search-input-field-checkout"]',
          'button[data-testid="structured-search-input-field-split-dates-1"]',
          'div[data-testid="structured-search-input-field-split-dates-1"]',
          'button[aria-label*="Check out" i]',
          'button[aria-label*="Checkout" i]',
          'input[name="checkout"]',
          'input[aria-label*="Check out" i]'
        ];
    const locator = await this.findFirstVisibleLocator(page, selectors, 2000, `calendar_${field}_field`);
    if (locator) {
      await this.safeClick(locator.locator, { step: `calendar_${field}_field`, selector: locator.selector });
    }
  }

  private buildSetGuestCountScript(targetAdults: number): string {
    return String.raw`(() => {
      const desired = ${JSON.stringify(targetAdults)};
      const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
      const adultTokens = [
        'adult',
        'adults',
        '\u6210\u4eba',
        '\u5927\u4eba',
        '\u65c5\u5ba2',
        '\u4f4f\u5ba2'
      ];
      const dialog = document.querySelector('[role="dialog"]')
        || document.querySelector('[data-testid*="guest"]')
        || document.querySelector('[data-testid*="guests"]');
      const scope = dialog || document;
      const candidates = Array.from(scope.querySelectorAll('[data-testid*="stepper"], [role="group"], li, div'));
      const adultsTextCandidates = Array.from(scope.querySelectorAll('div, span, p, h3, h4, h5, button, [role="button"]'))
        .map((node) => ({
          tag: node.tagName ? node.tagName.toLowerCase() : '',
          text: normalize(node.textContent || ''),
          testId: normalize(node.getAttribute('data-testid') || ''),
          ariaLabel: normalize(node.getAttribute('aria-label') || '')
        }))
        .filter((node) => {
          const text = node.text.toLowerCase();
          const aria = node.ariaLabel.toLowerCase();
          return text === 'adults' || text === '成人' || aria.includes('adult') || aria.includes('成人');
        })
        .slice(0, 4);
      const candidateSamples = candidates.slice(0, 4).map((node) => ({
        tag: node.tagName ? node.tagName.toLowerCase() : '',
        testId: normalize(node.getAttribute('data-testid') || ''),
        ariaLabel: normalize(node.getAttribute('aria-label') || ''),
        text: normalize(node.textContent || '').slice(0, 80)
      }));
      let adultsRow = null;
      for (const candidate of candidates) {
        const text = normalize(candidate.textContent || '').toLowerCase();
        const ariaLabel = normalize(candidate.getAttribute('aria-label') || '').toLowerCase();
        const testId = normalize(candidate.getAttribute('data-testid') || '').toLowerCase();
        const matchesAdult = adultTokens.some((token) => (
          text.includes(token) || ariaLabel.includes(token) || testId.includes(token)
        ));
        if (!matchesAdult) continue;
        const increaseButton = candidate.querySelector(
          'button[aria-label*="increase" i], button[aria-label*="add" i], button[aria-label*="plus" i],'
          + 'button[data-testid*="increase"], button[data-testid*="increment"], button[data-testid*="plus"], button[data-testid*="add"]'
        );
        if (increaseButton) {
          adultsRow = candidate;
          break;
        }
      }

      if (!adultsRow) {
        const labelNodes = Array.from(scope.querySelectorAll('div, span, p, h3, h4, h5'))
          .filter((node) => {
            const text = normalize(node.textContent || '').toLowerCase();
            return text === 'adults' || text === '成人';
          });
        const labelSamples = labelNodes.slice(0, 3).map((node) => ({
          tag: node.tagName ? node.tagName.toLowerCase() : '',
          text: normalize(node.textContent || '').slice(0, 60)
        }));
        for (const labelNode of labelNodes) {
          let container = labelNode;
          for (let i = 0; i < 6 && container; i += 1) {
            const increaseButton = container.querySelector(
              'button[aria-label*="increase" i], button[aria-label*="add" i], button[aria-label*="plus" i],'
              + 'button[data-testid*="increase"], button[data-testid*="increment"], button[data-testid*="plus"], button[data-testid*="add"]'
            );
            if (increaseButton) {
              adultsRow = container;
              break;
            }
            container = container.parentElement;
          }
          if (adultsRow) break;
        }
        if (!adultsRow) {
          return {
            success: false,
            reason: 'adults_row_not_found',
            scopeTag: dialog ? (dialog.getAttribute('data-testid') || dialog.getAttribute('role') || 'dialog') : 'document',
            candidateCount: candidates.length,
            candidateSamples,
            labelCount: labelNodes.length,
            labelSamples,
            adultsTextCandidates
          };
        }
      }

      if (!adultsRow) {
        return {
          success: false,
          reason: 'adults_row_not_found',
          scopeTag: dialog ? (dialog.getAttribute('data-testid') || dialog.getAttribute('role') || 'dialog') : 'document',
          candidateCount: candidates.length,
          candidateSamples,
          adultsTextCandidates
        };
      }

      const adultsRowMeta = {
        tag: adultsRow.tagName ? adultsRow.tagName.toLowerCase() : '',
        testId: normalize(adultsRow.getAttribute && adultsRow.getAttribute('data-testid') || ''),
        ariaLabel: normalize(adultsRow.getAttribute && adultsRow.getAttribute('aria-label') || ''),
        text: normalize(adultsRow.textContent || '').slice(0, 80)
      };

      const readCount = (row) => {
        const valueNodes = Array.from(row.querySelectorAll(
          '[data-testid*="stepper-value"], [aria-live="polite"], [role="status"], [role="spinbutton"], [aria-valuenow], input[type="number"], span, div'
        ));
        const valueSamples = valueNodes.slice(0, 4).map((node) => ({
          tag: node.tagName ? node.tagName.toLowerCase() : '',
          ariaValue: node.getAttribute ? (node.getAttribute('aria-valuenow') || '') : '',
          text: normalize(node.textContent || '').slice(0, 40)
        }));
        const numericNode = valueNodes.find((node) => {
          const ariaValue = node.getAttribute && node.getAttribute('aria-valuenow');
          if (ariaValue && /^\\d+$/.test(String(ariaValue))) return true;
          const text = normalize(node.textContent || '');
          return /^\\d+$/.test(text);
        });
        if (numericNode) {
          const ariaValue = numericNode.getAttribute && numericNode.getAttribute('aria-valuenow');
          if (ariaValue && /^\\d+$/.test(String(ariaValue))) {
            return Number(ariaValue);
          }
          return Number(normalize(numericNode.textContent || ''));
        }
        const inputNode = valueNodes.find((node) => node.tagName && node.tagName.toLowerCase() === 'input');
        if (inputNode && inputNode.value && /^\\d+$/.test(String(inputNode.value))) {
          return Number(inputNode.value);
        }
        const rowAria = normalize(row.getAttribute && row.getAttribute('aria-label') || '');
        const rowMatch = rowAria.match(/\\b(\\d+)\\b/);
        if (rowMatch && rowMatch[1]) {
          return Number(rowMatch[1]);
        }
        const fallbackText = normalize(row.textContent || '');
        const match = fallbackText.match(/\\b(\\d+)\\b/);
        if (match && match[1]) {
          return Number(match[1]);
        }
        return null;
      };
      const readWhoCount = () => {
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const candidates = Array.from(document.querySelectorAll('button, [role="button"]'))
          .map((el) => ({
            text: normalize(el.textContent || ''),
            ariaLabel: normalize(el.getAttribute('aria-label') || '')
          }))
          .filter((item) => {
            const hay = (item.text + ' ' + item.ariaLabel).toLowerCase();
            return hay.includes('who') && hay.includes('guest');
          });
        const label = candidates.find((item) => /\\d+/.test(item.text || item.ariaLabel));
        const source = label ? (label.text || label.ariaLabel) : '';
        const match = source.match(/(\\d+)/);
        return match && match[1] ? Number(match[1]) : null;
      };
      let current = readCount(adultsRow);
      if (current === null || Number.isNaN(current)) {
        current = readWhoCount();
      }
      if (current === null || Number.isNaN(current)) {
        return {
          success: false,
          reason: 'current_not_found',
          adultsRowMeta
        };
      }

      const increase = adultsRow.querySelector(
        'button[aria-label*="increase" i], button[aria-label*="add" i], button[aria-label*="plus" i],'
        + 'button[data-testid*="increase"], button[data-testid*="increment"], button[data-testid*="plus"], button[data-testid*="add"]'
      );
      const decrease = adultsRow.querySelector(
        'button[aria-label*="decrease" i], button[aria-label*="minus" i],'
        + 'button[data-testid*="decrease"], button[data-testid*="decrement"], button[data-testid*="minus"], button[data-testid*="reduce"]'
      );
      if (!increase && !decrease) {
        return {
          success: false,
          reason: 'stepper_controls_missing',
          adultsRowMeta
        };
      }

      let clicks = 0;
      if (desired > current && increase) {
        clicks = desired - current;
        for (let i = 0; i < clicks; i += 1) {
          if (increase.disabled || increase.getAttribute('aria-disabled') === 'true') break;
          increase.click();
        }
      } else if (desired < current && decrease) {
        clicks = current - desired;
        for (let i = 0; i < clicks; i += 1) {
          if (decrease.disabled || decrease.getAttribute('aria-disabled') === 'true') break;
          decrease.click();
        }
      }

      let postCurrent = readCount(adultsRow);
      if (postCurrent === null || Number.isNaN(postCurrent)) {
        postCurrent = readWhoCount();
      }
      if (postCurrent === null || Number.isNaN(postCurrent)) {
        return {
          success: false,
          reason: 'post_value_not_found',
          current,
          target: desired,
          clicks,
          scopeTag: dialog ? (dialog.getAttribute('data-testid') || dialog.getAttribute('role') || 'dialog') : 'document',
          adultsRowMeta
        };
      }
      if (postCurrent !== desired) {
        return {
          success: false,
          reason: 'value_not_updated',
          current,
          postCurrent,
          target: desired,
          clicks,
          scopeTag: dialog ? (dialog.getAttribute('data-testid') || dialog.getAttribute('role') || 'dialog') : 'document',
          adultsRowMeta
        };
      }
      return {
        success: true,
        current,
        postCurrent,
        target: desired,
        clicks,
        scopeTag: dialog ? (dialog.getAttribute('data-testid') || dialog.getAttribute('role') || 'dialog') : 'document',
        adultsRowMeta
      };
    })()`;
  }

  private async setGuestCount(page: Page, guests: number): Promise<boolean> {
    const targetAdults = Math.max(1, guests || 1);
    this.logUiAction('set_guests', 'start', { target: targetAdults });
    const script = this.buildSetGuestCountScript(targetAdults);
    const result = await this.evaluateScript<{
      success?: boolean;
      reason?: string;
      current?: number;
      postCurrent?: number;
      target?: number;
      clicks?: number;
      scopeTag?: string;
    }>(page, script, 'set_guests');
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H51',location:'stagehand.ts:setGuestCount:result',message:'setGuestCount result snapshot',data:result,timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!result || typeof result !== 'object' || result.success !== true) {
      const reason = typeof result === 'object' && result ? (result as { reason?: string }).reason : undefined;
      const scopeTag = typeof result === 'object' && result ? (result as { scopeTag?: string }).scopeTag : undefined;
      this.logUiAction('set_guests', 'fail', {
        target: targetAdults,
        reason: reason || 'unknown',
        scopeTag
      });
      logger.warn('mcp', 'browserbase_ui_set_guests_failed', {
        target: targetAdults,
        reason: reason || 'unknown',
        scopeTag,
        details: result && typeof result === 'object' ? result : undefined
      });
      return false;
    }

    const typedResult = result as { current: number; target: number; clicks: number };
    logger.info('mcp', 'browserbase_ui_guests_set', {
      current: typedResult.current,
      target: typedResult.target,
      clicks: typedResult.clicks,
      scopeTag: (result as { scopeTag?: string }).scopeTag
    });
    this.logUiAction('set_guests', 'success', {
      current: typedResult.current,
      target: typedResult.target,
      clicks: typedResult.clicks,
      scopeTag: (result as { scopeTag?: string }).scopeTag
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/99f82ebe-4390-4262-be54-89548ecfb0d7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H52',location:'stagehand.ts:setGuestCount:success',message:'setGuestCount success metrics',data:{current:typedResult.current,target:typedResult.target,clicks:typedResult.clicks,scopeTag:(result as { scopeTag?: string }).scopeTag || ''},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return true;
  }

  private async trySetGuestsInFrames(page: Page, guests: number): Promise<boolean> {
    const frames = typeof page.frames === 'function' ? page.frames() : [];
    if (!frames || frames.length <= 1) return false;
    const script = this.buildSetGuestCountScript(Math.max(1, guests || 1));
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue;
      const start = Date.now();
      const frameMeta = (() => {
        const anyFrame = frame as { url?: () => string; name?: () => string };
        return {
          frameUrl: anyFrame.url ? anyFrame.url() : '',
          frameName: anyFrame.name ? anyFrame.name() : ''
        };
      })();
      try {
        const result = await frame.evaluate(script);
        const success = Boolean(result && typeof result === 'object' && (result as { success?: boolean }).success);
        this.logUiAction('set_guests_frame', success ? 'success' : 'fail', {
          ...frameMeta,
          durationMs: Date.now() - start
        });
        if (success) return true;
      } catch (error) {
        this.logUiAction('set_guests_frame', 'fail', {
          ...frameMeta,
          durationMs: Date.now() - start,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return false;
  }

  private async waitForGuestPanel(page: Page, timeoutMs: number): Promise<boolean> {
    const selectors = [
      '[role="dialog"] [data-testid*="stepper"]',
      '[role="dialog"] button[aria-label*="increase" i]',
      '[data-testid*="guest"] [data-testid*="stepper"]',
      '[data-testid*="guests"] [data-testid*="stepper"]',
      '[data-testid*="guest"] button[aria-label*="increase" i]',
      '[data-testid*="guests"] button[aria-label*="increase" i]',
      'button[aria-label*="Adults" i]'
    ];
    const panelLocator = await this.findFirstVisibleLocator(page, selectors, timeoutMs, 'guest_panel');
    return !!panelLocator;
  }

  private async waitForListings(page: Page, timeoutMs: number): Promise<number> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const script = String.raw`(() => {
        const cards = document.querySelectorAll('[data-testid="card-container"]');
        if (cards.length > 0) return cards.length;
        return document.querySelectorAll('a[href*="/rooms/"]').length;
      })()`;
      const count = await this.evaluateScript<number>(page, script, 'wait_for_listings_count');
      if (count > 0) return count;
      await this.delay(500);
    }
    return 0;
  }

  private async warmListingGrid(page: Page): Promise<void> {
    const script = String.raw`(async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const target = Math.min(document.body.scrollHeight, window.innerHeight * 2);
      let scrolled = 0;
      while (scrolled < target) {
        window.scrollBy(0, 400);
        scrolled += 400;
        await delay(150);
      }
      window.scrollTo(0, 0);
    })()`;
    await this.evaluateScript(page, script, 'warm_listing_grid');
  }

  private async findVisibleLocator(page: Page, selector: string, timeoutMs: number): Promise<StagehandLocator | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const locator = page.locator(selector);
        const count = await locator.count();
        for (let i = 0; i < count; i += 1) {
          const candidate = locator.nth(i);
          try {
            if (await candidate.isVisible()) {
              return candidate;
            }
          } catch {
            // ignore visibility errors
          }
        }
      } catch {
        // ignore locator errors
      }
      await this.delay(300);
    }
    return null;
  }

  private async safeClick(locator: StagehandLocator, metadata?: Record<string, unknown>): Promise<boolean> {
    const baseMetadata = metadata ?? {};
    this.logUiAction('click', 'start', baseMetadata);
    try {
      await locator.click();
      this.logUiAction('click', 'success', { ...baseMetadata, method: 'click' });
      return true;
    } catch (error) {
      this.logUiAction('click', 'fail', {
        ...baseMetadata,
        method: 'click',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      await locator.sendClickEvent();
      this.logUiAction('click', 'success', { ...baseMetadata, method: 'sendClickEvent' });
      return true;
    } catch (error) {
      this.logUiAction('click', 'fail', {
        ...baseMetadata,
        method: 'sendClickEvent',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  private async safeFill(
    locator: StagehandLocator,
    value: string,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    const baseMetadata = metadata ?? {};
    this.logUiAction('fill', 'start', {
      ...baseMetadata,
      value,
      valueLength: value.length
    });
    try {
      await locator.fill(value);
      this.logUiAction('fill', 'success', { ...baseMetadata, method: 'fill' });
      return true;
    } catch (error) {
      this.logUiAction('fill', 'fail', {
        ...baseMetadata,
        method: 'fill',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      await locator.type(value, { delay: 30 });
      this.logUiAction('fill', 'success', { ...baseMetadata, method: 'type' });
      return true;
    } catch (error) {
      this.logUiAction('fill', 'fail', {
        ...baseMetadata,
        method: 'type',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  private async extractListingsFromDom(page: Page): Promise<Array<Record<string, unknown>>> {
    const script = String.raw`(() => {
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
    })()`;
    return this.evaluateScript<Array<Record<string, unknown>>>(page, script, 'extract_listings_dom');
  }

  private async collectSearchSignals(page: Page): Promise<{ signals: string[]; listingCount: number; pageTitle: string }> {
    const script = String.raw`(() => {
      const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
      const bodyText = normalize(document.body?.innerText || '');
      const combined = (document.title + ' ' + bodyText).toLowerCase();
      const signals = [];
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
    })()`;
    return this.evaluateScript<{ signals: string[]; listingCount: number; pageTitle: string }>(
      page,
      script,
      'collect_search_signals'
    );
  }

  async getListingDetails(url: string): Promise<ListingDetail> {
    if (!this.connected) {
      throw new Error('Stagehand adapter not connected');
    }

    return this.getListingDetailsLocal(url);
  }

  private async getListingDetailsLocal(url: string): Promise<ListingDetail> {
    if (!this.stagehand) {
      throw new Error('Stagehand adapter not connected');
    }

    const detailPage = await this.stagehand.context.newPage();

    try {
      await detailPage.goto(url, {
        waitUntil: 'domcontentloaded',
        timeoutMs: this.config.timeout
      });
      await this.delay(2000);
    } catch (error) {
      logger.error('mcp', 'browserbase_detail_goto_failed', {
        url,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    try {
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

      return parseListingDetail(extractResult, url);
    } catch {
      const script = String.raw`(() => {
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const getText = (selector) => {
          const el = document.querySelector(selector);
          return el ? normalize(el.textContent || '') : '';
        };
        const getMeta = (name) => {
          const el = document.querySelector('meta[property="' + name + '"]')
            || document.querySelector('meta[name="' + name + '"]');
          return el ? normalize(el.getAttribute('content') || '') : '';
        };

        const reviewBlocks = Array.from(document.querySelectorAll('[data-testid="review"]')).slice(0, 15);
        const reviews = reviewBlocks.map((block) => {
          const text = normalize(block.querySelector('[data-testid="review-text"]')?.textContent || '');
          const author = normalize(block.querySelector('[data-testid="review-avatar-name"]')?.textContent || '');
          const date = normalize(block.querySelector('time')?.textContent || '');
          return { text, author, date };
        }).filter((review) => review.text);

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
      })()`;
      const fallbackDetail = await this.evaluateScript<Record<string, unknown>>(
        detailPage,
        script,
        'detail_fallback_extract'
      );

      return parseListingDetail(fallbackDetail, url);
    } finally {
      await detailPage.close().catch(() => undefined);
    }
  }

  async getMultipleListingDetails(urls: string[]): Promise<ListingDetail[]> {
    return this.getMultipleListingDetailsLocal(urls);
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
}
