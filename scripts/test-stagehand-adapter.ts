#!/usr/bin/env tsx
/**
 * Debug test using actual StagehandAdapter class (local mode)
 */

// Register path aliases for tsx
import 'tsconfig-paths/register';

import { StagehandAdapter } from '../src/lib/mcp/stagehand';
import { SearchParams } from '../src/types/listing';

async function debugStagehandAdapter() {
  console.log('=== Debug Actual StagehandAdapter (Local Mode) ===\n');

  const params: SearchParams = {
    location: 'Tokyo',
    checkIn: '2026-02-10',
    checkOut: '2026-02-17',
    guests: 2,
    budgetMax: 400,
    currency: 'USD',
    budgetMin: null,
  };

  const adapter = new StagehandAdapter({
    timeout: 30000,
    localOptions: {
      headless: false,
    },
  });

  try {
    console.log('Connecting...');
    await adapter.connect();
    console.log('✓ Connected successfully');

    // Test health check
    console.log('\nTesting health check...');
    const isHealthy = await adapter.healthCheck();
    console.log('Health check:', isHealthy ? '✓ Healthy' : '✗ Unhealthy');

    // Test search
    console.log('\nCalling searchAirbnb...');
    const listings = await adapter.searchAirbnb(params);

    console.log('\n=== Search Results ===');
    console.log('Listing count:', listings.length);
    if (listings.length > 0) {
      console.log('\nFirst listing:');
      console.log(JSON.stringify(listings[0], null, 2));

      // Test getting listing details
      if (listings[0].url) {
        console.log('\n=== Testing getListingDetails ===');
        console.log('Fetching details for:', listings[0].url);
        try {
          const details = await adapter.getListingDetails(listings[0].url);
          console.log('\nListing details:');
          console.log(JSON.stringify({
            title: details.title,
            pricePerNight: details.pricePerNight,
            currency: details.currency,
            rating: details.rating,
            reviewCount: details.reviewCount,
            reviewsCount: details.reviews?.length || 0,
            hasDescription: !!details.description,
            hasImageUrl: !!details.imageUrl,
          }, null, 2));
          if (details.reviews && details.reviews.length > 0) {
            console.log('\nFirst review:');
            console.log(JSON.stringify(details.reviews[0], null, 2));
          }
        } catch (error) {
          console.error('Error fetching listing details:', error);
        }
      }
    } else {
      console.log('No listings found');
    }

    // Test screenshot
    console.log('\n=== Testing Screenshot ===');
    try {
      const screenshot = await adapter.takeScreenshot();
      if (screenshot) {
        console.log('✓ Screenshot captured, length:', screenshot.length);
      } else {
        console.log('Screenshot returned null (may be using callback)');
      }
    } catch (error) {
      console.error('Error taking screenshot:', error);
    }

    console.log('\nDisconnecting...');
    await adapter.disconnect();
    console.log('✓ Disconnected successfully');
  } catch (error) {
    console.error('\n✗ Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    try {
      await adapter.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    process.exit(1);
  }
}

debugStagehandAdapter().catch(console.error);
