import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import { AuthService } from '../services/auth';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';

export class StatusCommand {
  private authService: AuthService;
  private config: ConfigManager;
  private logger: Logger;

  constructor() {
    this.config = new ConfigManager();
    this.authService = new AuthService(this.config.getServerUrl());
    this.logger = new Logger('STATUS');
  }

  getCommand(): Command {
    const cmd = new Command('status');
    cmd.description('Show system status and connectivity');
    cmd.option('--verbose', 'Show detailed status information');
    cmd.action(async (options) => {
      await this.statusCommand(options);
    });

    return cmd;
  }

  private async statusCommand(options: any): Promise<void> {
    console.log(chalk.cyan('📊 KprCli Status Report\\n'));

    // Check authentication status
    await this.checkAuthStatus();
    
    // Check server connectivity
    await this.checkServerConnectivity();
    
    // Check configuration
    await this.checkConfiguration(options.verbose);
    
    // Show additional info if verbose
    if (options.verbose) {
      await this.showVerboseInfo();
    }
  }

  private async checkAuthStatus(): Promise<void> {
    console.log(chalk.yellow('🔐 Authentication Status:'));
    
    if (this.authService.isAuthenticated()) {
      const user = this.authService.getCurrentUser();
      console.log(`  ${chalk.green('✓')} Authenticated as ${chalk.bold(user.email)}`);
      
      // Check token expiration
      const expiresAt = this.config.get('token_expires_at') as number;
      const expiresIn = Math.max(0, expiresAt - Date.now());
      const hoursLeft = Math.floor(expiresIn / (1000 * 60 * 60));
      const minutesLeft = Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60));
      
      if (expiresIn > 0) {
        console.log(`  ${chalk.green('✓')} Token valid for ${hoursLeft}h ${minutesLeft}m`);
      } else {
        console.log(`  ${chalk.red('✗')} Token has expired`);
      }
      
      console.log(`  ${chalk.green('✓')} Subscription: ${user.subscription_tier} (${user.subscription_status})`);
      console.log(`  ${chalk.green('✓')} Credits: ${user.automation_credits} automation credits remaining`);
      
    } else {
      console.log(`  ${chalk.red('✗')} Not authenticated`);
      console.log(`  ${chalk.gray('→')} Run ${chalk.cyan('kprcli auth login')} to sign in`);
    }
    
    console.log('');
  }

  private async checkServerConnectivity(): Promise<void> {
    console.log(chalk.yellow('🌐 Server Connectivity:'));
    
    const serverUrl = this.config.getServerUrl();
    console.log(`  ${chalk.gray('Server:')} ${serverUrl}`);
    
    // Test basic connectivity
    const healthSpinner = ora('Testing server health...').start();
    try {
      const response = await axios.get(`${serverUrl}/api/health`, {
        timeout: 5000
      });
      
      if (response.status === 200) {
        const healthData = response.data;
        healthSpinner.succeed('Server is healthy');
        console.log(`  ${chalk.green('✓')} Service: ${healthData.service}`);
        console.log(`  ${chalk.green('✓')} Version: ${healthData.version}`);
        console.log(`  ${chalk.green('✓')} Environment: ${healthData.environment}`);
      } else {
        healthSpinner.fail(`Server returned ${response.status}`);
      }
    } catch (error: any) {
      healthSpinner.fail('Server unreachable');
      console.log(`  ${chalk.red('✗')} Error: ${error.message}`);
      console.log(`  ${chalk.gray('→')} Check your server URL with ${chalk.cyan('kprcli config server')}`);
    }
    
    // Test authentication endpoints
    const authSpinner = ora('Testing authentication endpoints...').start();
    try {
      const response = await axios.post(`${serverUrl}/api/device/authorize`, 
        { client_id: 'test', scope: 'read' },
        { 
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
          validateStatus: () => true // Accept any status code
        }
      );
      
      if (response.status === 200 || response.status === 400) {
        authSpinner.succeed('Authentication endpoints available');
        console.log(`  ${chalk.green('✓')} Device authorization flow ready`);
      } else {
        authSpinner.fail(`Auth endpoint returned ${response.status}`);
      }
    } catch (error: any) {
      authSpinner.fail('Authentication endpoints unreachable');
      console.log(`  ${chalk.red('✗')} Error: ${error.message}`);
    }
    
    console.log('');
  }

  private async checkConfiguration(verbose: boolean): Promise<void> {
    console.log(chalk.yellow('⚙️  Configuration:'));
    
    const configPath = this.config.getConfigPath();
    console.log(`  ${chalk.green('✓')} Config file: ${chalk.gray(configPath)}`);
    
    // Check key settings
    const autoOpenBrowser = this.config.getAutoOpenBrowser();
    console.log(`  ${chalk.green('✓')} Auto-open browser: ${autoOpenBrowser ? 'enabled' : 'disabled'}`);
    
    if (verbose) {
      const allConfig = this.config.exportConfig(false);
      const configKeys = Object.keys(allConfig).length;
      console.log(`  ${chalk.green('✓')} Total settings: ${configKeys}`);
    }
    
    console.log('');
  }

  private async showVerboseInfo(): Promise<void> {
    console.log(chalk.yellow('🔧 System Information:'));
    
    // Node.js version
    console.log(`  ${chalk.green('✓')} Node.js: ${process.version}`);
    
    // Platform information
    console.log(`  ${chalk.green('✓')} Platform: ${process.platform} ${process.arch}`);
    
    // Memory usage
    const memUsage = process.memoryUsage();
    const memMB = Math.round(memUsage.rss / 1024 / 1024);
    console.log(`  ${chalk.green('✓')} Memory: ${memMB} MB`);
    
    // Environment
    const isDev = process.env.NODE_ENV === 'development';
    console.log(`  ${chalk.green('✓')} Environment: ${isDev ? 'development' : 'production'}`);
    
    // CLI version
    const packageJson = require('../../package.json');
    console.log(`  ${chalk.green('✓')} KprCli version: ${packageJson.version}`);
    
    console.log('');
  }
}