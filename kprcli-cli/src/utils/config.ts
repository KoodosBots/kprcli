import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './logger';

export class ConfigManager {
  private configPath: string;
  private config: Record<string, any> = {};
  private logger = new Logger('CONFIG');

  constructor() {
    // Create config directory path
    const configDir = path.join(os.homedir(), '.kprcli');
    this.configPath = path.join(configDir, 'config.json');

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Load existing config or create with defaults
    this.loadConfig();
  }

  private loadConfig(): void {
    const defaults = {
      server_url: 'http://localhost',
      auto_open_browser: true,
      log_level: 'info'
    };

    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = { ...defaults, ...JSON.parse(configData) };
      } else {
        this.config = defaults;
        this.saveConfig();
      }
    } catch (error) {
      this.logger.warn('Failed to load config, using defaults');
      this.config = defaults;
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      this.logger.error('Failed to save config', error);
    }
  }

  /**
   * Get configuration value
   */
  get(key: string): any {
    return this.config[key];
  }

  /**
   * Set configuration value
   */
  set(key: string, value: any): void {
    this.config[key] = value;
    this.saveConfig();
  }

  /**
   * Delete configuration value
   */
  delete(key: string): void {
    delete this.config[key];
    this.saveConfig();
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return key in this.config;
  }

  /**
   * Get all configuration
   */
  getAll(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * Clear all configuration
   */
  clear(): void {
    this.config = {
      server_url: 'http://localhost',
      auto_open_browser: true,
      log_level: 'info'
    };
    this.saveConfig();
    this.logger.info('Configuration cleared');
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Get server URL
   */
  getServerUrl(): string {
    return this.get('server_url') || 'http://localhost';
  }

  /**
   * Set server URL
   */
  setServerUrl(url: string): void {
    // Validate URL format
    try {
      new URL(url);
      this.set('server_url', url);
      this.logger.success(`Server URL updated to: ${url}`);
    } catch (error) {
      throw new Error(`Invalid URL format: ${url}`);
    }
  }

  /**
   * Get auto open browser setting
   */
  getAutoOpenBrowser(): boolean {
    return this.get('auto_open_browser') ?? true;
  }

  /**
   * Set auto open browser setting
   */
  setAutoOpenBrowser(enabled: boolean): void {
    this.set('auto_open_browser', enabled);
    this.logger.info(`Auto open browser: ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Export configuration for backup/sharing
   */
  exportConfig(includeTokens = false): Record<string, any> {
    const config = { ...this.getAll() };
    
    if (!includeTokens) {
      // Remove sensitive data
      delete config.access_token;
      delete config.refresh_token;
      delete config.token_expires_at;
    }

    return config;
  }

  /**
   * Import configuration from backup
   */
  importConfig(configData: Record<string, any>, merge = true): void {
    if (!merge) {
      this.clear();
    }

    for (const [key, value] of Object.entries(configData)) {
      this.set(key, value);
    }

    this.logger.success('Configuration imported successfully');
  }
}