#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { AuthCommand } from './commands/auth';
import { ConfigCommand } from './commands/config';
import { StatusCommand } from './commands/status';
import { VersionCommand } from './commands/version';

const program = new Command();

// ASCII Art Banner
const banner = chalk.cyan(`
 ██╗  ██╗██████╗ ██████╗  ██████╗██╗     ██╗
 ██║ ██╔╝██╔══██╗██╔══██╗██╔════╝██║     ██║
 █████╔╝ ██████╔╝██████╔╝██║     ██║     ██║
 ██╔═██╗ ██╔═══╝ ██╔══██╗██║     ██║     ██║
 ██║  ██╗██║     ██║  ██║╚██████╗███████╗██║
 ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝
                                             
    KprCli - Form Automation CLI Tool
`);

function showBanner() {
  console.log(banner);
  console.log(chalk.gray('  Your gateway to intelligent form automation\n'));
}

// Main program configuration
program
  .name('kprcli')
  .description('KprCli - CLI for form automation and device authorization')
  .version('1.0.0')
  .hook('preAction', () => {
    if (program.args.length === 0) {
      showBanner();
    }
  });

// Add commands
program.addCommand(new AuthCommand().getCommand());
program.addCommand(new ConfigCommand().getCommand());
program.addCommand(new StatusCommand().getCommand());
program.addCommand(new VersionCommand().getCommand());

// Handle no arguments - show help with banner
program.action(() => {
  showBanner();
  program.help();
});

// Parse arguments
program.parse();