import { Command } from 'commander';
import chalk from 'chalk';

export class VersionCommand {
  getCommand(): Command {
    const cmd = new Command('version');
    cmd.description('Show version information');
    cmd.action(() => {
      this.versionCommand();
    });

    return cmd;
  }

  private versionCommand(): void {
    const packageJson = require('../../package.json');
    
    console.log(chalk.cyan('📦 KprCli Version Information\\n'));
    console.log(`${chalk.bold('Version:')} ${packageJson.version}`);
    console.log(`${chalk.bold('Description:')} ${packageJson.description}`);
    console.log(`${chalk.bold('Node.js:')} ${process.version}`);
    console.log(`${chalk.bold('Platform:')} ${process.platform} ${process.arch}`);
    
    if (packageJson.homepage) {
      console.log(`${chalk.bold('Homepage:')} ${chalk.blue.underline(packageJson.homepage)}`);
    }
    
    if (packageJson.bugs?.url) {
      console.log(`${chalk.bold('Report bugs:')} ${chalk.blue.underline(packageJson.bugs.url)}`);
    }
    
    console.log('');
  }
}