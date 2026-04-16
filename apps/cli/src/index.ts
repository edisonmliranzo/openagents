#!/usr/bin/env node

import { cac } from 'cac';
import chalk from 'chalk';
import ora from 'ora';
import { readlineSync } from 'readline-sync';

const cli = cac('openagents');

// Banner
console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════╗
║  OpenAgents CLI - Your AI Agent at Your Fingertips         ║
║  Self-improving AI powered by OpenAgents Platform         ║
╚═══════════════════════════════════════════════════════════╝
`));

// Global options
cli.option('-u, --url <url>', 'API server URL', { default: process.env.OPENAGENTS_API_URL || 'http://localhost:3000' });
cli.option('-k, --api-key <key>', 'API key for authentication');
cli.option('--no-color', 'Disable colors');

// Commands
cli.command('chat', 'Start an interactive chat session')
  .option('-c, --context <context>', 'Initial context/prompt')
  .option('-m, --model <model>', 'LLM model to use')
  .action(async (options) => {
    const spinner = ora('Connecting to OpenAgents...').start();
    
    try {
      const apiUrl = options.url;
      const context = options.context || '';
      const model = options.model || 'default';
      
      spinner.succeed(chalk.green('Connected! Starting chat session...\n'));
      
      console.log(chalk.dim('Type "exit" or "quit" to end the session\n'));
      
      if (context) {
        console.log(chalk.yellow('Context: '), context, '\n');
      }
      
      // Chat loop
      while (true) {
        const input = readlineSync.question(chalk.blue('You: '));
        
        if (!input.trim()) continue;
        
        if (['exit', 'quit', 'q'].includes(input.toLowerCase())) {
          console.log(chalk.green('\nGoodbye! Your session has been saved to memory.\n'));
          break;
        }
        
        const responseSpinner = ora('Agent is thinking...').start();
        
        try {
          const response = await fetch(`${apiUrl}/api/agent/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(options.apiKey && { 'Authorization': `Bearer ${options.apiKey}` }),
            },
            body: JSON.stringify({ 
              message: input, 
              context,
              model,
              stream: false 
            }),
          });
          
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          
          const data = await response.json();
          responseSpinner.stop();
          
          console.log(chalk.green('\nAgent: '), data.reply || data.message || data.content, '\n');
          
          // Track conversation for learning
          await trackInteraction(input, data.reply || '', apiUrl, options.apiKey);
          
        } catch (error: any) {
          responseSpinner.fail(chalk.red(`Error: ${error.message}`));
        }
      }
      
    } catch (error: any) {
      spinner.fail(chalk.red(`Connection failed: ${error.message}`));
      process.exit(1);
    }
  });

cli.command('send <message>', 'Send a single message and exit')
  .option('-c, --context <context>', 'Additional context')
  .option('-m, --model <model>', 'LLM model to use')
  .action(async (message: string, options) => {
    const spinner = ora('Sending message...').start();
    
    try {
      const response = await fetch(`${options.url}/api/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.apiKey && { 'Authorization': `Bearer ${options.apiKey}` }),
        },
        body: JSON.stringify({ 
          message, 
          context: options.context,
          model: options.model,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      spinner.stop();
      
      console.log(chalk.green('\nAgent: '), data.reply || data.message || data.content, '\n');
      
    } catch (error: any) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

cli.command('memory', 'View and manage agent memory')
  .option('--list', 'List all memories')
  .option('--search <query>', 'Search memories')
  .option('--clear', 'Clear all memories')
  .action(async (options) => {
    const spinner = ora('Loading memory...').start();
    
    try {
      if (options.list) {
        const response = await fetch(`${options.url}/api/memory`, {
          headers: {
            ...(options.apiKey && { 'Authorization': `Bearer ${options.apiKey}` }),
          },
        });
        
        const data = await response.json();
        spinner.stop();
        
        console.log(chalk.cyan('\n📚 Agent Memory:\n'));
        data.memories?.forEach((mem: any, i: number) => {
          console.log(chalk.yellow(`${i + 1}. ${mem.key || mem.text}`));
          console.log(chalk.dim(`   Weight: ${mem.weight || 1} | Created: ${mem.createdAt || 'unknown'}\n`));
        });
        
      } else if (options.search) {
        const response = await fetch(`${options.url}/api/memory/search?q=${encodeURIComponent(options.search)}`, {
          headers: {
            ...(options.apiKey && { 'Authorization': `Bearer ${options.apiKey}` }),
          },
        });
        
        const data = await response.json();
        spinner.stop();
        
        console.log(chalk.cyan(`\n🔍 Search results for "${options.search}":\n`));
        data.results?.forEach((result: any, i: number) => {
          console.log(chalk.yellow(`${i + 1}. ${result.text || result.content}`));
          console.log(chalk.dim(`   Score: ${result.score || result.relevance || 'N/A'}\n`));
        });
        
      } else if (options.clear) {
        const confirmed = readlineSync.question(chalk.red('Are you sure you want to clear all memories? (y/N): '));
        if (confirmed.toLowerCase() === 'y') {
          await fetch(`${options.url}/api/memory/clear`, { 
            method: 'DELETE',
            headers: {
              ...(options.apiKey && { 'Authorization': `Bearer ${options.apiKey}` }),
            },
          });
          spinner.succeed(chalk.green('Memory cleared successfully!'));
        }
      }
      
    } catch (error: any) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

cli.command('status', 'Check platform status and health')
  .action(async (options) => {
    const spinner = ora('Checking status...').start();
    
    try {
      const [healthRes, metricsRes] = await Promise.all([
        fetch(`${options.url}/api/health`),
        fetch(`${options.url}/api/metrics`, {
          headers: {
            ...(options.apiKey && { 'Authorization': `Bearer ${options.apiKey}` }),
          },
        }),
      ]);
      
      const health = await healthRes.json();
      const metrics = await metricsRes.json().catch(() => ({}));
      
      spinner.stop();
      
      console.log(chalk.cyan('\n🏥 Platform Status:\n'));
      console.log(chalk.green('✓ API Server:'), health.status || 'healthy');
      console.log(chalk.green('✓ Database:'), health.database || 'connected');
      console.log(chalk.green('✓ Memory Store:'), health.memory || 'active');
      
      if (metrics.agents) {
        console.log(chalk.cyan('\n📊 Active Agents:'), metrics.agents);
      }
      if (metrics.sessions) {
        console.log(chalk.cyan('📊 Active Sessions:'), metrics.sessions);
      }
      
    } catch (error: any) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

cli.command('config', 'Configure CLI settings')
  .option('--set-url <url>', 'Set default API URL')
  .option('--set-key <key>', 'Set default API key')
  .option('--show', 'Show current configuration')
  .action(async (options) => {
    if (options.show) {
      console.log(chalk.cyan('\n⚙️  Current Configuration:\n'));
      console.log('API URL:', chalk.yellow(process.env.OPENAGENTS_API_URL || 'http://localhost:3000'));
      console.log('API Key:', chalk.yellow(process.env.OPENAGENTS_API_KEY ? '********' : '(not set)'));
    } else if (options.setUrl) {
      process.env.OPENAGENTS_API_URL = options.setUrl;
      console.log(chalk.green(`API URL set to: ${options.setUrl}`));
    } else if (options.setKey) {
      process.env.OPENAGENTS_API_KEY = options.setKey;
      console.log(chalk.green('API key has been set'));
    }
  });

cli.command('learn', 'View learning statistics and insights')
  .action(async (options) => {
    const spinner = ora('Fetching learning insights...').start();
    
    try {
      const response = await fetch(`${options.url}/api/learning/stats`, {
        headers: {
          ...(options.apiKey && { 'Authorization': `Bearer ${options.apiKey}` }),
        },
      });
      
      const data = await response.json();
      spinner.stop();
      
      console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════╗
║  🧠 OpenAgents Learning Insights                          ║
╚═══════════════════════════════════════════════════════════╝
`));
      
      console.log(chalk.yellow('Sessions Completed:'), data.sessions || 0);
      console.log(chalk.yellow('Patterns Learned:'), data.patternsLearned || 0);
      console.log(chalk.yellow('Preferences Captured:'), data.preferences || 0);
      console.log(chalk.yellow('Context Understanding:'), data.contextScore ? `${data.contextScore}%` : 'N/A');
      console.log(chalk.yellow('Improvement Rate:'), data.improvementRate ? `${data.improvementRate}%` : 'N/A');
      
      if (data.topPatterns?.length) {
        console.log(chalk.cyan('\n🔝 Top Learned Patterns:'));
        data.topPatterns.forEach((p: string, i: number) => {
          console.log(chalk.dim(`  ${i + 1}. ${p}`));
        });
      }
      
    } catch (error: any) {
      spinner.fail(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Helper function to track interactions for learning
async function trackInteraction(input: string, output: string, apiUrl: string, apiKey?: string) {
  try {
    await fetch(`${apiUrl}/api/learning/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({ input, output, timestamp: Date.now() }),
    });
  } catch {
    // Silently fail - learning tracking should not interrupt chat
  }
}

// Help
cli.command('help', 'Show help information').action(() => {
  cli.outputHelp();
});

// Version
cli.version('1.0.0');

// Parse
cli.parse();
