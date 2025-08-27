import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';

export class ConfigCommand {
  private config: ConfigManager;
  private logger: Logger;

  constructor() {
    this.config = new ConfigManager();
    this.logger = new Logger('CONFIG');
  }

  getCommand(): Command {
    const cmd = new Command('config');
    cmd.description('Configuration management commands');

    // List command
    cmd
      .command('list')
      .alias('ls')
      .description('Show current configuration')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        await this.listCommand(options);
      });

    // Set command
    cmd
      .command('set <key> <value>')
      .description('Set configuration value')
      .action(async (key, value) => {
        await this.setCommand(key, value);
      });

    // Get command
    cmd
      .command('get <key>')
      .description('Get configuration value')
      .action(async (key) => {
        await this.getConfigValue(key);
      });

    // Delete command
    cmd
      .command('delete <key>')
      .alias('del')
      .description('Delete configuration value')
      .action(async (key) => {
        await this.deleteCommand(key);
      });

    // Reset command
    cmd
      .command('reset')
      .description('Reset configuration to defaults')
      .action(async () => {
        await this.resetCommand();
      });

    // Server command
    cmd
      .command('server [url]')
      .description('Get or set server URL')
      .action(async (url) => {
        await this.serverCommand(url);
      });

    // Path command
    cmd
      .command('path')
      .description('Show configuration file path')
      .action(() => {
        console.log(this.config.getConfigPath());
      });

    return cmd;
  }

  private async listCommand(options: any): Promise<void> {
    try {
      const config = this.config.exportConfig(false); // Don't include sensitive tokens

      if (options.json) {
        console.log(JSON.stringify(config, null, 2));
      } else {
        console.log(chalk.cyan('📋 Current Configuration:'));
        console.log('');

        if (Object.keys(config).length === 0) {
          console.log(chalk.gray('  No configuration values set'));
          return;
        }

        // Group configuration by type
        const serverConfig = {
          server_url: config.server_url
        };

        const uiConfig = {
          auto_open_browser: config.auto_open_browser,
          log_level: config.log_level
        };

        const userInfo = config.user ? {
          email: config.user.email,
          username: config.user.username,
          subscription_tier: config.user.subscription_tier
        } : {};

        // Display server configuration
        if (serverConfig.server_url) {
          console.log(chalk.yellow('🌐 Server Configuration:'));
          console.log(`  ${chalk.bold('URL:')} ${serverConfig.server_url}`);
          console.log('');
        }

        // Display UI configuration
        console.log(chalk.yellow('⚙️  Interface Configuration:'));
        console.log(`  ${chalk.bold('Auto Open Browser:')} ${uiConfig.auto_open_browser ? 'enabled' : 'disabled'}`);
        console.log(`  ${chalk.bold('Log Level:')} ${uiConfig.log_level}`);
        console.log('');

        // Display user information if authenticated
        if (userInfo.email) {
          console.log(chalk.yellow('👤 User Information:'));
          console.log(`  ${chalk.bold('Email:')} ${userInfo.email}`);
          console.log(`  ${chalk.bold('Username:')} ${userInfo.username || 'Not set'}`);
          console.log(`  ${chalk.bold('Subscription:')} ${userInfo.subscription_tier}`);
          console.log('');
        }

        console.log(chalk.gray(`Configuration file: ${this.config.getConfigPath()}`));
      }

    } catch (error: any) {
      this.logger.error('Failed to list configuration', error);
    }
  }

  private async setCommand(key: string, value: string): Promise<void> {
    try {
      // Handle special keys
      switch (key) {
        case 'server_url':
          this.config.setServerUrl(value);
          break;
        
        case 'auto_open_browser':
          const boolValue = value.toLowerCase() === 'true' || value === '1';
          this.config.setAutoOpenBrowser(boolValue);
          break;
        
        case 'log_level':
          if (!['debug', 'info', 'warn', 'error'].includes(value)) {
            throw new Error('Invalid log level. Must be: debug, info, warn, error');
          }
          this.config.set(key, value);
          break;
        
        default:
          // Try to parse as JSON, fallback to string
          let parsedValue: any = value;
          try {
            parsedValue = JSON.parse(value);
          } catch {
            // Keep as string
          }
          
          this.config.set(key, parsedValue);
          break;
      }

      console.log(chalk.green(`✓ Set ${chalk.bold(key)} = ${chalk.cyan(value)}`));

    } catch (error: any) {
      this.logger.error(`Failed to set ${key}`, error);
    }
  }

  private async getConfigValue(key: string): Promise<void> {
    try {
      if (!this.config.has(key)) {
        console.log(chalk.yellow(`Configuration key '${key}' not found`));
        return;
      }

      const value = this.config.get(key);
      
      if (typeof value === 'object') {
        console.log(JSON.stringify(value, null, 2));
      } else {
        console.log(value);
      }

    } catch (error: any) {
      this.logger.error(`Failed to get ${key}`, error);
    }
  }

  private async deleteCommand(key: string): Promise<void> {
    try {
      if (!this.config.has(key)) {
        console.log(chalk.yellow(`Configuration key '${key}' not found`));
        return;
      }

      // Warn about sensitive keys
      if (['access_token', 'refresh_token', 'user'].includes(key)) {
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: `This will delete authentication data. Continue?`,
          default: false
        }]);

        if (!confirm) {
          return;
        }
      }

      this.config.delete(key);
      console.log(chalk.green(`✓ Deleted ${chalk.bold(key)}`));

    } catch (error: any) {
      this.logger.error(`Failed to delete ${key}`, error);
    }
  }

  private async resetCommand(): Promise<void> {
    try {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'This will reset all configuration to defaults. Continue?',
        default: false
      }]);

      if (!confirm) {
        return;
      }

      this.config.clear();
      console.log(chalk.green('✓ Configuration reset to defaults'));

    } catch (error: any) {
      this.logger.error('Failed to reset configuration', error);
    }
  }

  private async serverCommand(url?: string): Promise<void> {
    try {
      if (url) {
        this.config.setServerUrl(url);
        console.log(chalk.green(`✓ Server URL set to: ${url}`));
      } else {
        const currentUrl = this.config.getServerUrl();
        console.log(chalk.cyan('Server URL:'), currentUrl);
      }

    } catch (error: any) {
      this.logger.error('Server command failed', error);
    }
  }
}