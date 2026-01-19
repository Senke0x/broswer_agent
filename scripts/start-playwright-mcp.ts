#!/usr/bin/env tsx
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const host = process.env.PLAYWRIGHT_MCP_HOST || '127.0.0.1';
const port = process.env.PLAYWRIGHT_MCP_PORT || process.env.MCP_PORT || '3001';
const browser = process.env.PLAYWRIGHT_MCP_BROWSER || 'chromium';
const headless = process.env.PLAYWRIGHT_MCP_HEADLESS !== 'false';
const noSandbox = process.env.PLAYWRIGHT_MCP_NO_SANDBOX !== 'false';

const binName = process.platform === 'win32' ? 'mcp-server-playwright.cmd' : 'mcp-server-playwright';
const binPath = path.resolve(process.cwd(), 'node_modules', '.bin', binName);
const useNpx = !fs.existsSync(binPath);

const baseArgs = ['--host', host, '--port', port, '--browser', browser];
if (headless) baseArgs.push('--headless');
if (noSandbox) baseArgs.push('--no-sandbox');

const command = useNpx ? 'npx' : binPath;
const args = useNpx ? ['-y', '@playwright/mcp@latest', ...baseArgs] : baseArgs;

console.log('[Playwright MCP] Starting server...', {
  command,
  args,
});

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
