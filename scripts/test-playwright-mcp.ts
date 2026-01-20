/**
 * Standalone Airbnb MCP Agent (Fixed for tsx/esbuild)
 * * 修复了 __name is not defined 错误
 * * 使用字符串常量定义浏览器脚本，避免编译工具注入
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "node:fs";
import path from "node:path";

// ==========================================
// 1. Browser Scripts (String Payloads)
// ==========================================
// ⚠️ 修改说明：
// 移除了外层的 `()` 和末尾的 `()`。
// 现在它们是纯粹的"函数定义字符串"，等待 Server 端去调用。

const BROWSER_PAYLOADS = {
  // 滚动脚本：Async Function Definition
  scroll: `
    async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const maxScrolls = 6;
      let count = 0;

      try {
        if (document.readyState !== 'complete') await delay(1000);

        console.log('Scrolling to trigger lazy load...');
        while (count < maxScrolls) {
          window.scrollBy(0, 800);
          await delay(400);
          if ((window.innerHeight + window.scrollY) >= document.body.scrollHeight) break;
          count++;
        }
        window.scrollTo(0, 0);
        return { status: "scrolled", attempts: count };
      } catch (e) {
        return { status: "error", message: e.toString() };
      }
    }
  `,

  // 提取脚本：Arrow Function Definition
  extract: `
    () => {
      // --- 内部辅助函数 ---
      const getText = (root, selector) => {
        const el = root.querySelector(selector);
        return el ? (el.textContent?.trim() || "") : "";
      };

      const getAttr = (root, selector, attr) => {
        const el = root.querySelector(selector);
        return el ? (el.getAttribute(attr) || "") : "";
      };

      // --- 核心逻辑 ---
      const cardNodes = document.querySelectorAll('[data-testid="card-container"]');
      const cards = cardNodes.length > 0
        ? Array.from(cardNodes).slice(0, 10)
        : Array.from(document.querySelectorAll('div[itemprop="itemListElement"]')).slice(0, 10);

      return cards.map(card => {
        const title = getText(card, '[data-testid="listing-card-title"]') ||
                      getText(card, '[id^="title_"]');

        const priceRaw = getText(card, '[data-testid="price-availability-row"]') ||
                         getText(card, 'span[class*="_1y74zjx"]') ||
                         getText(card, '_1y74zjx');

        const priceMatch = priceRaw.match(/\\$([\\d,]+)/) || priceRaw.match(/([\\d,]+)/);
        let pricePerNight = 0;
        let currency = 'USD';

        if (priceMatch) {
          pricePerNight = parseInt(priceMatch[1].replace(/,/g, ''), 10);
        }

        const ratingRaw = getText(card, '[aria-label*="rating"]') ||
                          getAttr(card, 'span[role="img"]', 'aria-label');
        const ratingMatch = ratingRaw ? ratingRaw.match(/(\\d+(\\.\\d+)?)/) : null;
        const rating = ratingMatch ? parseFloat(ratingMatch[0]) : null;

        const relativeLink = getAttr(card, 'a[href*="/rooms/"]', 'href');
        const url = relativeLink
          ? (relativeLink.startsWith('http') ? relativeLink : 'https://www.airbnb.com' + relativeLink)
          : "";

        const imageUrl = getAttr(card, 'img[src*="airbnb"]', 'src');

        return { title, pricePerNight, currency, rating, url, imageUrl };
      }).filter(item => item.title && item.url);
    }
  `
};

const AIRBNB_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const AIRBNB_WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

const formatAirbnbDateLabel = (dateStr: string) => {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  const day = date.getUTCDate();
  const month = AIRBNB_MONTHS[date.getUTCMonth()];
  const weekday = AIRBNB_WEEKDAYS[date.getUTCDay()];
  const year = date.getUTCFullYear();
  return `${day}, ${weekday}, ${month} ${year}.`;
};

// ==========================================
// 2. The MCP Agent Class
// ==========================================

class AirbnbAgent {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private serverUrl: string;
  private toolNames: Set<string> = new Set();
  private tools = {
    navigate: 'playwright_navigate',
    evaluate: 'playwright_evaluate',
    snapshot: 'browser_snapshot',
    click: 'browser_click',
    type: 'browser_type',
    waitFor: 'browser_wait_for',
    pressKey: 'browser_press_key'
  };

  constructor(url: string) {
    this.serverUrl = url;
    this.transport = new StreamableHTTPClientTransport(new URL(url));
    this.client = new Client(
      { name: "airbnb-search-cli", version: "1.0.0" },
      { capabilities: {} }
    );
  }

  async connect() {
    console.log(`🔌 Connecting to MCP Server at ${this.serverUrl}...`);
    try {
      await this.client.connect(this.transport);
      console.log("✅ Connected successfully.");

      const list = await this.client.listTools();
      const toolNames = list.tools.map(t => t.name);
      this.toolNames = new Set(toolNames);
      console.log("🧰 MCP Tools:", toolNames.join(', '));

      if (toolNames.includes('browser_navigate')) {
        console.log("ℹ️  Detected 'browser_' prefix tools.");
        this.tools.navigate = 'browser_navigate';
        this.tools.evaluate = 'browser_evaluate';
        this.tools.snapshot = 'browser_snapshot';
        this.tools.click = 'browser_click';
        this.tools.type = 'browser_type';
        this.tools.waitFor = 'browser_wait_for';
        this.tools.pressKey = 'browser_press_key';
      } else if (toolNames.includes('playwright_navigate')) {
        console.log("ℹ️  Detected 'playwright_' prefix tools.");
        this.tools.navigate = 'playwright_navigate';
        this.tools.evaluate = 'playwright_evaluate';
      } else {
        console.warn("⚠️ Warning: Standard tools not found. Using defaults.");
      }

    } catch (e) {
      console.error(`❌ Connection failed.`);
      throw e;
    }
  }

  async search(params: { location: string; checkIn: string; checkOut: string; guests: number }) {
    console.log(`\n🔍 Search Intent: ${params.location}`);
    const homeUrl = 'https://www.airbnb.com.sg/';
    console.log(`🔗 Home URL: ${homeUrl}`);

    console.log(`🚀 Navigating using ${this.tools.navigate}...`);
    await this.callTool(this.tools.navigate, { url: homeUrl });

    const checkInLabel = formatAirbnbDateLabel(params.checkIn);
    const checkOutLabel = formatAirbnbDateLabel(params.checkOut);
    const guests = Math.max(1, params.guests || 1);

    console.log("🧭 Using snapshot + click/type flow...");
    const ok = await this.performSnapshotSearch({
      location: params.location,
      checkInLabel,
      checkOutLabel,
      guests
    });
    if (!ok) {
      throw new Error("Snapshot flow failed; MCP-only mode has no fallback.");
    }

    console.log("📜 Scrolling to load listings...");
    // ⚠️ 修改点：直接传递字符串，不需要 .toString()
    const scrollScript = BROWSER_PAYLOADS.scroll;

    const evalArgs = this.tools.evaluate.includes('browser')
      ? { function: scrollScript }
      : { script: scrollScript };

    await this.callTool(this.tools.evaluate, evalArgs);

    console.log("⛏️  Extracting data...");
    // ⚠️ 修改点：直接传递字符串
    const extractScript = BROWSER_PAYLOADS.extract;
    const extractArgs = this.tools.evaluate.includes('browser')
      ? { function: extractScript }
      : { script: extractScript };

    const result = await this.callTool(this.tools.evaluate, extractArgs);

    return this.parseMcpResult(result);
  }

  private extractRefFromLine(line: string): string | null {
    const patterns = [
      /\[ref=([^\]]+)\]/i,
      /\bref[:=]\s*([A-Za-z0-9_-]+)/i
    ];
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return null;
  }

  private findRef(snapshot: string, matcher: RegExp | string, roleHint?: RegExp): string | null {
    const lines = snapshot.split('\n');
    for (const line of lines) {
      const textMatch = typeof matcher === 'string'
        ? line.toLowerCase().includes(matcher.toLowerCase())
        : matcher.test(line);
      if (!textMatch) continue;
      if (roleHint && !roleHint.test(line)) continue;
      const ref = this.extractRefFromLine(line);
      if (ref) return ref;
    }
    return null;
  }

  private async takeSnapshot(): Promise<string> {
    const result = await this.callTool(this.tools.snapshot, {});
    const text = this.extractContentText(result.content);
    return text || '';
  }

  private snapshotDir(): string {
    const dir = path.resolve(process.cwd(), 'tmp', 'mcp-snapshots');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private saveSnapshot(step: string, snapshot: string) {
    const safeStep = step.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
    const filename = `${Date.now()}_${safeStep}.md`;
    const filePath = path.join(this.snapshotDir(), filename);
    fs.writeFileSync(filePath, snapshot, 'utf8');
    console.log(`🧾 Snapshot saved: ${filePath}`);
  }

  private logSnapshotPreview(step: string, snapshot: string) {
    const lines = snapshot.split('\n').slice(0, 20).join('\n');
    console.log(`🧾 Snapshot preview (${step}):\n${lines}`);
  }

  private async performSnapshotSearch(params: {
    location: string;
    checkInLabel: string;
    checkOutLabel: string;
    guests: number;
  }): Promise<boolean> {
    const click = async (element: string, ref: string) => {
      await this.callTool(this.tools.click, { element, ref });
    };
    const type = async (element: string, ref: string, text: string, submit = false) => {
      await this.callTool(this.tools.type, { element, ref, text, submit });
    };
    const findLine = (snapshotText: string, matcher: RegExp) => {
      const line = snapshotText.split('\n').find((entry) => matcher.test(entry));
      return line || '';
    };
    const findLines = (snapshotText: string, matcher: RegExp, limit = 8) => {
      const lines = snapshotText.split('\n').filter((entry) => matcher.test(entry));
      return lines.slice(0, limit);
    };
    const findContextByRef = (snapshotText: string, ref: string, radius = 3) => {
      const lines = snapshotText.split('\n');
      const index = lines.findIndex((entry) => entry.includes(`[ref=${ref}]`));
      if (index < 0) return [];
      return lines.slice(Math.max(0, index - radius), Math.min(lines.length, index + radius + 1));
    };
    const wait = async (seconds: number) => {
      if (this.toolNames.has(this.tools.waitFor)) {
        await this.callTool(this.tools.waitFor, { time: seconds });
      } else {
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      }
    };

    const getLocationRef = (snapshotText: string) => this.findRef(
      snapshotText,
      /where|destination|location/i,
      /searchbox|textbox|input/i,
    ) || this.findRef(snapshotText, /searchbox\s*"where"/i)
      || this.findRef(snapshotText, 'Where', /searchbox|textbox|input/i);

    await wait(1);
    let snapshot = await this.takeSnapshot();
    console.log(`🧭 Step: locate location input`);
    console.log(`🧾 Snapshot length: ${snapshot.length}`);
    let locationRef = getLocationRef(snapshot);
    if (!locationRef) {
      console.warn("⚠️ Location input ref not found, trying to activate 'Where' tab.");
      const whereTabRef = this.findRef(snapshot, /where/i, /tab/i);
      const buttonLines = findLines(snapshot, /button \[ref=/i, 6);
      const headerButtonRefs = buttonLines
        .map(line => this.extractRefFromLine(line))
        .filter((ref): ref is string => Boolean(ref));
      for (const ref of headerButtonRefs.slice(0, 2)) {
        await click('Header search button', ref);
        await wait(1);
        snapshot = await this.takeSnapshot();
        locationRef = getLocationRef(snapshot);
        if (locationRef) break;
      }
      if (whereTabRef) {
        console.log(`✅ Where tab ref: ${whereTabRef}`);
        await click('Where tab', whereTabRef);
        await wait(1);
        snapshot = await this.takeSnapshot();
        locationRef = getLocationRef(snapshot);
      }
    }
    if (!locationRef) {
      console.warn("❌ Location input ref still not found after opening search.");
      this.logSnapshotPreview('location-input', snapshot);
      this.saveSnapshot('location-input', snapshot);
      return false;
    }
    console.log(`✅ Location ref: ${locationRef}`);
    await click('Location input', locationRef);
    await type('Location input', locationRef, params.location, false);
    snapshot = await this.takeSnapshot();
    console.log(`🧭 Step: select location suggestion`);
    let optionRef = this.findRef(snapshot, params.location, /option|listitem|button/i);
    if (!optionRef) {
      await wait(1);
      snapshot = await this.takeSnapshot();
      optionRef = this.findRef(snapshot, params.location, /option|listitem|button/i);
    }
    if (optionRef) {
      console.log(`✅ Location option ref: ${optionRef}`);
      await click('Location suggestion', optionRef);
    } else if (this.toolNames.has(this.tools.pressKey)) {
      console.warn("⚠️ Location option ref not found, fallback to Enter.");
      this.logSnapshotPreview('location-option', snapshot);
      this.saveSnapshot('location-option', snapshot);
      await this.callTool(this.tools.pressKey, { key: 'Enter' });
    }

    snapshot = await this.takeSnapshot();
    console.log(`🧭 Step: open date picker`);
    let whenRef = this.findRef(snapshot, /when/i, /button/i)
      || this.findRef(snapshot, /add dates/i, /button/i)
      || this.findRef(snapshot, /when add dates/i, /button/i);
    if (!whenRef) {
      await wait(1);
      snapshot = await this.takeSnapshot();
      whenRef = this.findRef(snapshot, /when/i, /button/i)
        || this.findRef(snapshot, /add dates/i, /button/i)
        || this.findRef(snapshot, /when add dates/i, /button/i);
    }
    if (!whenRef) {
      console.warn("❌ 'When' button ref not found.");
      this.logSnapshotPreview('when-button', snapshot);
      this.saveSnapshot('when-button', snapshot);
      return false;
    }
    console.log(`✅ When ref: ${whenRef}`);
    // await click('When', whenRef);
    await wait(1);
    snapshot = await this.takeSnapshot();
    console.log(`🧭 Step: select dates`);
    const calendarLine = findLine(snapshot, /application "Calendar"/i);
    const calendarRef = calendarLine ? this.extractRefFromLine(calendarLine) : null;
    const calendarContext = calendarRef ? findContextByRef(snapshot, calendarRef, 10) : [];
    const listLine = calendarContext.find(line => /list \[ref=/.test(line)) || '';
    const listRef = listLine ? this.extractRefFromLine(listLine) : null;
    if (listRef) {
      findContextByRef(snapshot, listRef, 120);
    }
    const checkInRef = this.findRef(snapshot, params.checkInLabel, /button/i);
    const checkOutRef = this.findRef(snapshot, params.checkOutLabel, /button/i);
    if (!checkInRef || !checkOutRef) {
      console.warn("❌ Date refs not found.", { checkInLabel: params.checkInLabel, checkOutLabel: params.checkOutLabel });
      this.logSnapshotPreview('dates', snapshot);
      this.saveSnapshot('dates', snapshot);
      return false;
    }
    console.log(`✅ Check-in ref: ${checkInRef}`);
    console.log(`✅ Check-out ref: ${checkOutRef}`);
    await click('Check-in date', checkInRef);
    snapshot = await this.takeSnapshot();
    let checkOutRefAfter = this.findRef(snapshot, params.checkOutLabel, /button/i);
    if (!checkOutRefAfter) {
      checkOutRefAfter = this.findRef(snapshot, /checkout date/i, /button/i);
    }
    const checkOutRefToUse = checkOutRefAfter || checkOutRef;
    await click('Check-out date', checkOutRefToUse);

    console.log(`🧭 Step: open guests picker`);
    let guestsRef = this.findRef(snapshot, /who|guests/i, /button/i);
    if (!guestsRef) {
      snapshot = await this.takeSnapshot();
      guestsRef = this.findRef(snapshot, /who|guests/i, /button/i);
    }
    if (!guestsRef) {
      await wait(1);
      snapshot = await this.takeSnapshot();
      guestsRef = this.findRef(snapshot, /who|guests/i, /button/i);
    }
    if (!guestsRef) {
      console.warn("❌ Guests button ref not found.");
      this.logSnapshotPreview('guests', snapshot);
      this.saveSnapshot('guests', snapshot);
      return false;
    }
    console.log(`✅ Guests ref: ${guestsRef}`);
    await click('Guests', guestsRef);

    snapshot = await this.takeSnapshot();
    console.log(`🧭 Step: increase adults`);
    const getAdultsIncreaseRef = (snapshotText: string) => {
      const lines = snapshotText.split('\n');
      const startIndex = lines.findIndex(line => /heading "Adults"/i.test(line));
      if (startIndex < 0) return null;
      const windowLines = lines.slice(startIndex, startIndex + 30);
      const increaseLine = windowLines.find(line => /button "increase value"/i.test(line));
      return increaseLine ? this.extractRefFromLine(increaseLine) : null;
    };
    let increaseRef = getAdultsIncreaseRef(snapshot)
      || this.findRef(snapshot, /increase value/i, /button/i)
      || this.findRef(snapshot, /increase.*adult|add.*adult|adult.*\+/i, /button/i);
    if (!increaseRef) {
      await wait(1);
      snapshot = await this.takeSnapshot();
      increaseRef = getAdultsIncreaseRef(snapshot)
        || this.findRef(snapshot, /increase value/i, /button/i)
        || this.findRef(snapshot, /increase.*adult|add.*adult|adult.*\+/i, /button/i);
    }
    if (!increaseRef) {
      console.warn("❌ Increase adults ref not found.");
      this.logSnapshotPreview('increase-adults', snapshot);
      this.saveSnapshot('increase-adults', snapshot);
      return false;
    }
    console.log(`✅ Increase ref: ${increaseRef}`);
    const parseAdultsCount = (text: string) => {
      const match = text.match(/(\d+)\s+Adults/i);
      return match ? Number(match[1]) : null;
    };
    const adultsBefore = parseAdultsCount(snapshot);
    const baselineAdults = adultsBefore ?? 1;
    const targetAdults = Math.max(1, params.guests);
    const clicksNeeded = Math.max(0, targetAdults - baselineAdults);
    for (let i = 0; i < clicksNeeded; i += 1) {
      await click('Increase adults', increaseRef);
    }

    snapshot = await this.takeSnapshot();
    console.log(`🧭 Step: click search`);
    let searchRef = this.findRef(snapshot, /search/i, /button/i);
    if (!searchRef) {
      await wait(1);
      snapshot = await this.takeSnapshot();
      searchRef = this.findRef(snapshot, /search/i, /button/i);
    }
    if (!searchRef) {
      console.warn("❌ Search button ref not found.");
      this.logSnapshotPreview('search', snapshot);
      this.saveSnapshot('search', snapshot);
      return false;
    }
    console.log(`✅ Search ref: ${searchRef}`);
    await click('Search', searchRef);

    snapshot = await this.takeSnapshot();
    console.log(`🧭 Step: dismiss got it`);
    let gotItRef = this.findRef(snapshot, /got it/i, /button/i);
    if (!gotItRef) {
      await wait(1);
      snapshot = await this.takeSnapshot();
      gotItRef = this.findRef(snapshot, /got it/i, /button/i);
    }
    if (gotItRef) {
      console.log(`✅ Got it ref: ${gotItRef}`);
      await click('Got it', gotItRef);
    }
    return true;
  }


  private async callTool(name: string, args: any) {
    try {
      const result = await this.client.callTool({ name, arguments: args });

      if (result.isError) {
        const contentText = this.extractContentText(result.content);
        // 忽略 ### Result 类型的 "假" 错误
        if (contentText.includes("### Result")) {
          return result;
        }
        throw new Error(`Tool '${name}' returned error: ${contentText || 'Unknown error'}`);
      }
      return result;
    } catch (error: any) {
      if (error.message.includes("returned error")) {
        throw error;
      }
      throw new Error(`Tool call '${name}' failed: ${error.message}`);
    }
  }

  private extractContentText(content: unknown): string {
    if (!Array.isArray(content)) return '';
    let text = '';
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const record = part as Record<string, unknown>;
      if (record.type === 'text' && typeof record.text === 'string') {
        text += record.text;
      } else if (record.type === 'resource' && record.resource) {
        const res = record.resource as Record<string, unknown>;
        if (typeof res.text === 'string') text += res.text;
      }
    }
    return text;
  }

  private parseMcpResult(result: any): any[] {
    if (!result.content || result.content.length === 0) return [];

    let rawText = this.extractContentText(result.content);
    rawText = rawText.trim();

    if (!rawText) return [];

    const resultMatch = rawText.match(/### Result\s*\n([\s\S]*?)(?:\n### |$)/);
    if (resultMatch) {
      rawText = resultMatch[1].trim();
    }

    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(json)?/, '').replace(/```$/, '');
    }

    try {
      const data = JSON.parse(rawText);
      return Array.isArray(data) ? data : [data];
    } catch (e) {
      console.error("⚠️ Failed to parse JSON result. Raw text preview:", rawText.substring(0, 200));
      return [];
    }
  }

  async close() {
    try { await this.client.close(); } catch (e) {}
  }
}

async function main() {
  const PORT = process.env.MCP_PORT || 8931;
  const BASE_URL = `http://localhost:${PORT}/mcp`;

  const agent = new AirbnbAgent(BASE_URL);

  try {
    await agent.connect();
    const listings = await agent.search({
      location: 'Paris, France',
      checkIn: '2026-01-21',
      checkOut: '2026-01-25',
      guests: 2
    });

    console.log(`\n🎉 Success! Found ${listings.length} listings.`);
    if (listings.length > 0) {
      console.table(listings.map(l => ({
        Title: l.title.length > 30 ? l.title.substring(0, 30) + '...' : l.title,
        Price: `${l.currency} ${l.pricePerNight}`,
        Rating: l.rating || 'N/A'
      })));
    } else {
      console.log("No listings found. Possible reasons: Anti-bot, selector changes, or network timeout.");
    }

  } catch (error) {
    console.error("\n❌ Agent Error:", error);
  } finally {
    process.exit(0);
  }
}

main();