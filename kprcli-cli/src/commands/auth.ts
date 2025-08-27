import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { AuthService } from '../services/auth';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';

export class AuthCommand {
  private authService: AuthService;
  private config: ConfigManager;
  private logger: Logger;

  constructor() {
    this.config = new ConfigManager();
    this.authService = new AuthService(this.config.getServerUrl());
    this.logger = new Logger('AUTH');
  }

  getCommand(): Command {
    const cmd = new Command('auth');
    cmd.description('Authentication commands');

    // Login command
    cmd
      .command('login')
      .description('Authenticate with KprCli server')
      .option('--no-browser', 'Don\'t automatically open browser')
      .option('--server <url>', 'KprCli server URL')
      .action(async (options) => {
        await this.loginCommand(options);
      });

    // Logout command
    cmd
      .command('logout')
      .description('Sign out and clear stored credentials')
      .action(async () => {
        await this.logoutCommand();
      });

    // Status command
    cmd
      .command('status')
      .description('Show authentication status')
      .action(async () => {
        await this.statusCommand();
      });

    // Refresh command
    cmd
      .command('refresh')
      .description('Refresh authentication tokens')
      .action(async () => {
        await this.refreshCommand();
      });

    return cmd;
  }

  private async loginCommand(options: any): Promise<void> {
    try {
      console.log(chalk.cyan('\n🔐 KprCli Authentication\n'));

      // Update server URL if provided
      if (options.server) {
        this.config.setServerUrl(options.server);
        this.authService = new AuthService(options.server);
      }

      // Check if already authenticated
      if (this.authService.isAuthenticated()) {
        const user = this.authService.getCurrentUser();
        this.logger.info(`Already authenticated as ${chalk.bold(user.email)}`);
        
        const { reauth } = await inquirer.prompt([{
          type: 'confirm',
          name: 'reauth',
          message: 'Do you want to re-authenticate?',
          default: false
        }]);

        if (!reauth) {
          return;
        }
      }

      // Start device authorization flow
      const spinner = ora('Initiating device authorization...').start();
      
      let deviceAuth;
      try {
        deviceAuth = await this.authService.initiateDeviceAuth();
        spinner.succeed('Device authorization initiated');
      } catch (error: any) {
        spinner.fail('Failed to initiate device authorization');
        this.logger.error('Authorization failed', error);
        return;
      }

      // Show user code and verification info
      console.log('\\n' + chalk.bgBlue.white.bold(' DEVICE AUTHORIZATION '));
      console.log('\\n' + chalk.yellow.bold('Your verification code:'));
      console.log(chalk.green.bold.underline(`  ${deviceAuth.user_code}`));
      console.log('\\n' + chalk.yellow('Please visit the following URL to authorize this device:'));
      console.log(chalk.blue.underline(`  ${deviceAuth.verification_uri}`));
      console.log('\\n' + chalk.gray(`Or use this direct link:`));
      console.log(chalk.gray.underline(`  ${deviceAuth.verification_uri_complete}`));

      // Open browser if requested
      if (options.browser !== false && this.config.getAutoOpenBrowser()) {
        console.log('\\n' + chalk.cyan('Opening browser...'));
        await this.authService.openVerificationUrl(deviceAuth.verification_uri_complete);
      }

      // Wait for user authorization
      console.log('\\n' + chalk.yellow('Waiting for authorization...'));
      console.log(chalk.gray('This will timeout in 30 minutes.\\n'));

      const authSpinner = ora('Waiting for user to complete authorization...').start();

      try {
        const tokenResponse = await this.authService.pollForToken(
          deviceAuth.device_code,
          deviceAuth.interval
        );

        authSpinner.succeed('Authorization successful!');

        // Store tokens
        await this.authService.storeTokens(tokenResponse);

        // Show success message
        console.log('\\n' + chalk.green.bold('✓ Successfully authenticated!'));
        console.log('\\n' + chalk.cyan('User Information:'));
        console.log(`  ${chalk.bold('Email:')} ${tokenResponse.user.email}`);
        console.log(`  ${chalk.bold('Username:')} ${tokenResponse.user.username || 'Not set'}`);
        console.log(`  ${chalk.bold('Subscription:')} ${tokenResponse.user.subscription_tier} (${tokenResponse.user.subscription_status})`);
        console.log(`  ${chalk.bold('Token Balance:')} ${tokenResponse.user.token_balance}`);
        console.log(`  ${chalk.bold('Automation Credits:')} ${tokenResponse.user.automation_credits}`);

        console.log('\\n' + chalk.green('You can now use KprCli commands that require authentication.'));

      } catch (error: any) {
        authSpinner.fail('Authorization failed');
        this.logger.error('Authentication failed', error);
      }

    } catch (error: any) {
      this.logger.error('Login command failed', error);
    }
  }

  private async logoutCommand(): Promise<void> {
    try {
      if (!this.authService.isAuthenticated()) {
        this.logger.info('Not currently authenticated');
        return;
      }

      const user = this.authService.getCurrentUser();
      
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Sign out from ${user.email}?`,
        default: true
      }]);

      if (confirm) {
        await this.authService.logout();
        console.log(chalk.green('✓ Successfully signed out'));
      }

    } catch (error: any) {
      this.logger.error('Logout command failed', error);
    }
  }

  private async statusCommand(): Promise<void> {
    try {
      if (!this.authService.isAuthenticated()) {
        console.log(chalk.yellow('❌ Not authenticated'));
        console.log(chalk.gray('Run `kprcli auth login` to sign in'));
        return;
      }

      const user = this.authService.getCurrentUser();
      const serverUrl = this.config.getServerUrl();

      console.log(chalk.green('✓ Authenticated'));
      console.log('\\n' + chalk.cyan('Authentication Status:'));
      console.log(`  ${chalk.bold('Server:')} ${serverUrl}`);
      console.log(`  ${chalk.bold('Email:')} ${user.email}`);
      console.log(`  ${chalk.bold('Username:')} ${user.username || 'Not set'}`);
      console.log(`  ${chalk.bold('User ID:')} ${user.id}`);
      console.log(`  ${chalk.bold('Subscription:')} ${user.subscription_tier} (${user.subscription_status})`);
      console.log(`  ${chalk.bold('Token Balance:')} ${user.token_balance}`);
      console.log(`  ${chalk.bold('Automation Credits:')} ${user.automation_credits}`);

      // Check token expiration
      const expiresAt = this.config.get('token_expires_at') as number;
      const expiresIn = Math.max(0, expiresAt - Date.now());
      const hoursLeft = Math.floor(expiresIn / (1000 * 60 * 60));
      const minutesLeft = Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60));

      console.log(`  ${chalk.bold('Token Expires:')} ${hoursLeft}h ${minutesLeft}m`);

    } catch (error: any) {
      this.logger.error('Status command failed', error);
    }
  }

  private async refreshCommand(): Promise<void> {
    try {
      if (!this.authService.isAuthenticated()) {
        this.logger.warn('Not authenticated. Please login first.');
        return;
      }

      const spinner = ora('Refreshing authentication tokens...').start();

      const refreshed = await this.authService.refreshToken();

      if (refreshed) {
        spinner.succeed('Tokens refreshed successfully');
      } else {
        spinner.fail('Token refresh failed');
        this.logger.warn('Please re-authenticate using `kprcli auth login`');
      }

    } catch (error: any) {
      this.logger.error('Refresh command failed', error);
    }
  }
}