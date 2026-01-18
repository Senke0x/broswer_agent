#!/usr/bin/env tsx
/**
 * Debug test using actual PlaywrightAdapter class
 */

import { PlaywrightAdapter } from '../src/lib/mcp/playwright';
import { SearchParams } from '../src/types/listing';

async function debugActualAdapter() {
  console.log('=== Debug Actual PlaywrightAdapter ===\n');

  const params: SearchParams = {
    location: 'Tokyo',
    checkIn: '2026-02-10',
    checkOut: '2026-02-17',
    guests: 2,
    budgetMax: 400,
    currency: 'USD',
    budgetMin: null,
  };

  const adapter = new PlaywrightAdapter({
    port: 3001,
    browser: 'chromium',
    headless: false,
    timeout: 30000,
  });

  try {
    console.log('Connecting...');
    await adapter.connect();

    console.log('Calling searchAirbnb...');
    const listings = await adapter.searchAirbnb(params);

    console.log('\n=== Results ===');
    console.log('Listing count:', listings.length);
    if (listings.length > 0) {
      console.log('\nFirst listing:');
      console.log(JSON.stringify(listings[0], null, 2));
    }

    await adapter.disconnect();
  } catch (error) {
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

debugActualAdapter().catch(console.error);
