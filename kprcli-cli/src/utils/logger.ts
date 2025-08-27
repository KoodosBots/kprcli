import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export class Logger {
  private context: string;
  private logLevel: LogLevel;

  constructor(context = 'KPRCLI', logLevel: LogLevel = 'info') {
    this.context = context;
    this.logLevel = logLevel;
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      success: 1
    };

    return levels[level] >= levels[this.logLevel];
  }

  private formatMessage(level: LogLevel, message: string, context?: string): string {
    const timestamp = chalk.gray(`[${this.getTimestamp()}]`);
    const ctx = chalk.blue(`[${context || this.context}]`);
    
    let levelColor: typeof chalk;
    let levelText: string;

    switch (level) {
      case 'debug':
        levelColor = chalk.gray;
        levelText = 'DEBUG';
        break;
      case 'info':
        levelColor = chalk.cyan;
        levelText = 'INFO ';
        break;
      case 'warn':
        levelColor = chalk.yellow;
        levelText = 'WARN ';
        break;
      case 'error':
        levelColor = chalk.red;
        levelText = 'ERROR';
        break;
      case 'success':
        levelColor = chalk.green;
        levelText = 'SUCCESS';
        break;
    }

    const levelFormatted = levelColor(`[${levelText}]`);
    return `${timestamp} ${levelFormatted} ${ctx} ${message}`;
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message));
      if (data) {
        console.log(chalk.gray(JSON.stringify(data, null, 2)));
      }
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message));
      if (data) {
        console.log(chalk.cyan(JSON.stringify(data, null, 2)));
      }
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      console.log(this.formatMessage('warn', message));
      if (data) {
        console.log(chalk.yellow(JSON.stringify(data, null, 2)));
      }
    }
  }

  error(message: string, error?: any): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message));
      if (error) {
        if (error.stack) {
          console.error(chalk.red(error.stack));
        } else if (typeof error === 'object') {
          console.error(chalk.red(JSON.stringify(error, null, 2)));
        } else {
          console.error(chalk.red(error));
        }
      }
    }
  }

  success(message: string, data?: any): void {
    if (this.shouldLog('success')) {
      console.log(this.formatMessage('success', message));
      if (data) {
        console.log(chalk.green(JSON.stringify(data, null, 2)));
      }
    }
  }

  // Convenience methods for common patterns
  loading(message: string): void {
    console.log(chalk.blue('⏳ ') + message);
  }

  checkmark(message: string): void {
    console.log(chalk.green('✓ ') + message);
  }

  cross(message: string): void {
    console.log(chalk.red('✗ ') + message);
  }

  arrow(message: string): void {
    console.log(chalk.blue('→ ') + message);
  }

  bullet(message: string): void {
    console.log(chalk.gray('• ') + message);
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }
}