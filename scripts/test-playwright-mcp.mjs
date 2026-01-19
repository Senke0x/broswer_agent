#!/usr/bin/env node
/**
 * Playwright MCP 功能测试脚本
 *
 * 用途: 实际测试 Playwright MCP 服务的功能
 * 用法: node scripts/test-playwright-mcp.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function info(message) {
  log(`ℹ ${message}`, 'cyan');
}

async function testPlaywrightMCP() {
  log('╔════════════════════════════════════════════╗', 'blue');
  log('║  Playwright MCP 功能测试                   ║', 'blue');
  log('╚════════════════════════════════════════════╝', 'blue');
  log('');

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@playwright/mcp'],
    env: process.env,
  });

  const client = new Client({
    name: 'playwright-mcp-tester',
    version: '1.0.0',
  }, {
    capabilities: {},
  });

  try {
    // 步骤 1: 连接
    log('[1/4] 连接到 Playwright MCP 服务器...', 'cyan');
    await client.connect(transport);
    success('连接成功');
    log('');

    // 步骤 2: 验证工具
    log('[2/4] 验证必需的工具...', 'cyan');
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map(t => t.name);

    const requiredTools = ['browser_navigate', 'browser_evaluate'];
    let allToolsFound = true;

    for (const toolName of requiredTools) {
      if (toolNames.includes(toolName)) {
        success(`工具 '${toolName}' 可用`);
      } else {
        error(`工具 '${toolName}' 不可用`);
        allToolsFound = false;
      }
    }

    if (!allToolsFound) {
      log('\n可用工具列表:', 'yellow');
      toolNames.forEach(name => log(`  - ${name}`, 'yellow'));
      throw new Error('必需的工具不可用');
    }
    log('');

    // 步骤 3: 测试导航
    log('[3/4] 测试页面导航...', 'cyan');
    const testUrl = 'https://example.com';
    info(`导航到 ${testUrl}`);

    const navigateResult = await client.callTool({
      name: 'browser_navigate',
      arguments: { url: testUrl }
    });

    if (navigateResult.content) {
      success('导航成功');
    } else {
      error('导航失败');
      throw new Error('导航失败');
    }
    log('');

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 步骤 4: 测试 JavaScript 执行
    log('[4/4] 测试 JavaScript 执行...', 'cyan');
    const evaluateCode = `({
      title: document.title,
      url: window.location.href,
      hasBody: !!document.body
    })`;

    info('执行 JavaScript 表达式...');
    const evaluateResult = await client.callTool({
      name: 'browser_evaluate',
      arguments: { expression: evaluateCode }
    });

    if (evaluateResult.content) {
      success('JavaScript 执行成功');
      const result = evaluateResult.content[0]?.text || evaluateResult.content[0];
      info(`结果: ${typeof result === 'string' ? result.substring(0, 100) : JSON.stringify(result).substring(0, 100)}`);

      // 尝试解析 JSON 结果
      try {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        if (parsed.title && parsed.url) {
          success(`页面标题: ${parsed.title}`);
          success(`页面 URL: ${parsed.url}`);
        }
      } catch (e) {
        // 如果不是 JSON,忽略
      }
    } else {
      error('JavaScript 执行失败');
      throw new Error('JavaScript 执行失败');
    }
    log('');

    // 清理
    try {
      await client.callTool({
        name: 'browser_close',
        arguments: {}
      });
      info('浏览器已关闭');
    } catch (e) {
      // 忽略关闭错误
    }

    await client.close();

    log('═'.repeat(50), 'blue');
    success('所有测试通过! Playwright MCP 服务可用且正常工作。');
    log('═'.repeat(50), 'blue');
    log('');

    return true;
  } catch (error) {
    error(`测试失败: ${error.message}`);
    log('');

    // 尝试清理
    try {
      await client.close();
    } catch (e) {
      // 忽略清理错误
    }

    log('═'.repeat(50), 'blue');
    error('测试失败! 请检查错误信息并修复问题。');
    log('═'.repeat(50), 'blue');
    log('');

    if (error.stack) {
      log('错误堆栈:', 'red');
      log(error.stack, 'red');
    }

    return false;
  }
}

// 运行测试
testPlaywrightMCP()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    log(`\n${colors.red}❌ 未预期的错误: ${error.message}${colors.reset}`, 'red');
    console.error(error);
    process.exit(1);
  });
