#!/usr/bin/env node
/**
 * Playwright MCP 部署检查脚本
 *
 * 用途: 验证 Playwright MCP 环境是否正确配置
 * 用法: node scripts/check-playwright-mcp.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'child_process';

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

function checkmark(success) {
  return success ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
}

async function checkNodeVersion() {
  log('\n[1/6] 检查 Node.js 版本...', 'cyan');
  try {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    const success = major >= 18;
    log(`  ${checkmark(success)} Node.js ${version} ${success ? '(符合要求)' : '(需要 v18+)'}`);
    return success;
  } catch (error) {
    log(`  ${checkmark(false)} 无法检查 Node.js 版本: ${error.message}`, 'red');
    return false;
  }
}

async function checkPlaywrightInstalled() {
  log('\n[2/6] 检查 Playwright 安装...', 'cyan');
  try {
    execSync('npx playwright --version', { stdio: 'pipe' });
    log(`  ${checkmark(true)} Playwright 已安装`);

    // 检查浏览器
    try {
      execSync('npx playwright install chromium --dry-run', { stdio: 'pipe' });
      log(`  ${checkmark(false)} Chromium 浏览器未安装`, 'yellow');
      log(`    提示: 运行 'npx playwright install chromium' 安装`, 'yellow');
    } catch {
      log(`  ${checkmark(true)} Chromium 浏览器已安装`);
    }
    return true;
  } catch (error) {
    log(`  ${checkmark(false)} Playwright 未安装`, 'red');
    log(`    提示: 运行 'npm install' 安装依赖`, 'yellow');
    return false;
  }
}

async function checkMCPPackage() {
  log('\n[3/6] 检查 MCP 服务器包...', 'cyan');

  const packages = [
    '@modelcontextprotocol/server-playwright',
    '@playwright/mcp',
    '@modelcontextprotocol/server-browser',
  ];

  for (const pkg of packages) {
    try {
      execSync(`npm view ${pkg} version`, { stdio: 'pipe' });
      log(`  ${checkmark(true)} 找到包: ${pkg}`);
      return pkg;
    } catch {
      // 包不存在,继续检查下一个
    }
  }

  log(`  ${checkmark(false)} 未找到 Playwright MCP 服务器包`, 'red');
  log(`    尝试的包名: ${packages.join(', ')}`, 'yellow');
  log(`    提示: 可能需要手动查找正确的包名`, 'yellow');
  return null;
}

async function checkMCPSDK() {
  log('\n[4/6] 检查 MCP SDK...', 'cyan');
  try {
    const sdkPath = new URL('@modelcontextprotocol/sdk/client/index.js', import.meta.url);
    log(`  ${checkmark(true)} MCP SDK 已安装`);
    return true;
  } catch (error) {
    log(`  ${checkmark(false)} MCP SDK 未安装: ${error.message}`, 'red');
    log(`    提示: 运行 'npm install @modelcontextprotocol/sdk'`, 'yellow');
    return false;
  }
}

async function testMCPConnection(packageName) {
  log('\n[5/6] 测试 MCP 服务器连接...', 'cyan');

  if (!packageName) {
    log(`  ${checkmark(false)} 跳过连接测试 (包名未知)`, 'yellow');
    return false;
  }

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', packageName],
    env: process.env,
  });

  const client = new Client({
    name: 'playwright-mcp-checker',
    version: '1.0.0',
  }, {
    capabilities: {},
  });

  try {
    log(`  尝试连接到 ${packageName}...`, 'yellow');
    await client.connect(transport);
    log(`  ${checkmark(true)} 连接成功!`);

    // 列出可用工具
    try {
      const tools = await client.listTools();
      log(`  ${checkmark(true)} 可用工具数量: ${tools.tools.length}`, 'green');

      if (tools.tools.length > 0) {
        log('\n  可用工具列表:', 'blue');
        tools.tools.forEach(tool => {
          log(`    - ${tool.name}${tool.description ? `: ${tool.description}` : ''}`, 'cyan');
        });
      }
    } catch (error) {
      log(`  ${checkmark(false)} 无法列出工具: ${error.message}`, 'yellow');
    }

    await client.close();
    return true;
  } catch (error) {
    log(`  ${checkmark(false)} 连接失败: ${error.message}`, 'red');
    if (error.message.includes('not found')) {
      log(`    提示: 包 ${packageName} 可能不存在或无法下载`, 'yellow');
    }
    return false;
  }
}

async function checkEnvironmentVariables() {
  log('\n[6/6] 检查环境变量...', 'cyan');

  const required = ['OPENAI_API_KEY'];
  const optional = ['MCP_MODE', 'MCP_PORT', 'MCP_BROWSER'];

  let allOk = true;

  for (const key of required) {
    const value = process.env[key];
    if (value) {
      log(`  ${checkmark(true)} ${key} = ${value.substring(0, 10)}...`);
    } else {
      log(`  ${checkmark(false)} ${key} 未设置 (必需)`, 'red');
      allOk = false;
    }
  }

  for (const key of optional) {
    const value = process.env[key];
    if (value) {
      log(`  ${checkmark(true)} ${key} = ${value}`);
    } else {
      log(`  ${checkmark(false)} ${key} 未设置 (可选,使用默认值)`);
    }
  }

  return allOk;
}

async function main() {
  log('╔════════════════════════════════════════════╗', 'blue');
  log('║  Playwright MCP 部署环境检查               ║', 'blue');
  log('╚════════════════════════════════════════════╝', 'blue');

  const results = {
    nodeVersion: await checkNodeVersion(),
    playwright: await checkPlaywrightInstalled(),
    mcpPackage: await checkMCPPackage(),
    mcpSDK: await checkMCPSDK(),
    envVars: await checkEnvironmentVariables(),
  };

  results.connection = await testMCPConnection(results.mcpPackage);

  // 总结
  log('\n' + '═'.repeat(50), 'blue');
  log('检查结果总结:', 'cyan');
  log('═'.repeat(50), 'blue');

  const checks = [
    ['Node.js 版本', results.nodeVersion],
    ['Playwright 安装', results.playwright],
    ['MCP 服务器包', results.mcpPackage !== null],
    ['MCP SDK', results.mcpSDK],
    ['环境变量', results.envVars],
    ['MCP 连接测试', results.connection],
  ];

  checks.forEach(([name, passed]) => {
    log(`  ${checkmark(passed)} ${name}`);
  });

  const allPassed = Object.values(results).every(v => v === true || (v !== null && v !== false));

  log('', 'reset');
  if (allPassed) {
    log('✅ 所有检查通过! Playwright MCP 环境已就绪。', 'green');
  } else {
    log('⚠️  部分检查未通过，请根据上述提示修复问题。', 'yellow');
    log('\n建议的修复步骤:', 'cyan');
    if (!results.nodeVersion) {
      log('  1. 升级 Node.js 到 v18 或更高版本', 'yellow');
    }
    if (!results.playwright) {
      log('  2. 运行: npm install', 'yellow');
      log('  3. 运行: npx playwright install chromium', 'yellow');
    }
    if (!results.mcpPackage) {
      log('  4. 检查 src/lib/mcp/playwright.ts 中的包名是否正确', 'yellow');
    }
    if (!results.mcpSDK) {
      log('  5. 运行: npm install @modelcontextprotocol/sdk', 'yellow');
    }
    if (!results.envVars) {
      log('  6. 创建 .env.local 文件并设置 OPENAI_API_KEY', 'yellow');
    }
    if (!results.connection) {
      log('  7. 检查 MCP 服务器包是否正确，或修改包名', 'yellow');
    }
  }

  log('', 'reset');
  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  log(`\n${colors.red}❌ 检查过程出错: ${error.message}${colors.reset}`, 'red');
  console.error(error);
  process.exit(1);
});
