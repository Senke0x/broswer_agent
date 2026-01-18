// Example usage of MCP adapters
// This file demonstrates how to use the Browserbase and Playwright adapters

import { createMCPAdapter, getDefaultMCPConfig, validateMCPConfig } from './adapter';
import { MCPMode } from '@/types/mcp';

/**
 * Example: Initialize and use Browserbase adapter
 */
export async function exampleBrowserbaseUsage() {
  const config = getDefaultMCPConfig();
  const mode: MCPMode = 'browserbase';

  // Validate configuration
  validateMCPConfig(mode, config);

  // Create adapter
  const adapter = createMCPAdapter(mode, config);

  if (Array.isArray(adapter)) {
    throw new Error('Expected single adapter, got array');
  }

  try {
    // Connect to Browserbase
    console.log('Connecting to Browserbase...');
    await adapter.connect();
    console.log('Connected successfully!');

    // Health check
    const isHealthy = await adapter.healthCheck();
    console.log('Health check:', isHealthy ? 'PASS' : 'FAIL');

    // Example search (not implemented yet)
    // const listings = await adapter.searchAirbnb({
    //   location: 'San Francisco, CA',
    //   checkIn: '2026-02-01',
    //   checkOut: '2026-02-05',
    //   guests: 2,
    // });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Always disconnect
    await adapter.disconnect();
    console.log('Disconnected');
  }
}

/**
 * Example: Use both adapters for A/B testing
 */
export async function exampleBothAdaptersUsage() {
  const config = getDefaultMCPConfig();
  const mode: MCPMode = 'both';

  const adapters = createMCPAdapter(mode, config);

  if (!Array.isArray(adapters)) {
    throw new Error('Expected array of adapters');
  }

  // Connect all adapters
  await Promise.all(adapters.map(a => a.connect()));

  // Run searches in parallel for comparison
  // const results = await Promise.all(
  //   adapters.map(adapter => adapter.searchAirbnb(params))
  // );

  // Disconnect all
  await Promise.all(adapters.map(a => a.disconnect()));
}
