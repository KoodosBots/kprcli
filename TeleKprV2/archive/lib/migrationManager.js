const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('./logger');
const { createClient } = require('@supabase/supabase-js');

class MigrationManager {
    constructor() {
        this.logger = createLogger({ component: 'MigrationManager' });
        this.migrationDir = path.join(__dirname, '..', 'migrations');
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );
    }

    // Initialize migration table
    async initializeMigrationTable() {
        this.logger.info('Initializing migration tracking table');
        
        const { error } = await this.supabase.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version VARCHAR(255) PRIMARY KEY,
                    name VARCHAR(500) NOT NULL,
                    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    checksum TEXT,
                    execution_time_ms INTEGER
                );
                
                CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at 
                ON schema_migrations(applied_at);
            `
        });

        if (error) {
            this.logger.error('Failed to initialize migration table', error);
            throw error;
        }

        this.logger.info('Migration table initialized successfully');
    }

    // Get applied migrations
    async getAppliedMigrations() {
        const { data, error } = await this.supabase
            .from('schema_migrations')
            .select('*')
            .order('version', { ascending: true });

        if (error) {
            this.logger.error('Failed to fetch applied migrations', error);
            throw error;
        }

        return data || [];
    }

    // Get pending migrations
    async getPendingMigrations() {
        const appliedMigrations = await this.getAppliedMigrations();
        const appliedVersions = new Set(appliedMigrations.map(m => m.version));
        
        // Read migration files
        const migrationFiles = await this.getMigrationFiles();
        
        return migrationFiles.filter(file => !appliedVersions.has(file.version));
    }

    // Read migration files from directory
    async getMigrationFiles() {
        try {
            const files = await fs.readdir(this.migrationDir);
            const migrationFiles = [];

            for (const file of files) {
                if (file.endsWith('.sql')) {
                    const filePath = path.join(this.migrationDir, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    
                    // Extract version and name from filename
                    // Expected format: 001_initial_schema.sql
                    const match = file.match(/^(\d+)_(.+)\.sql$/);
                    if (match) {
                        migrationFiles.push({
                            version: match[1],
                            name: match[2].replace(/_/g, ' '),
                            filename: file,
                            content: content.trim(),
                            checksum: this.generateChecksum(content)
                        });
                    }
                }
            }

            return migrationFiles.sort((a, b) => a.version.localeCompare(b.version));
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.info('Migration directory not found, creating it');
                await fs.mkdir(this.migrationDir, { recursive: true });
                return [];
            }
            throw error;
        }
    }

    // Generate checksum for migration content
    generateChecksum(content) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    // Apply a single migration
    async applyMigration(migration) {
        const startTime = Date.now();
        this.logger.info(`Applying migration ${migration.version}: ${migration.name}`);

        try {
            // Execute the migration SQL
            const { error: sqlError } = await this.supabase.rpc('exec_sql', {
                sql: migration.content
            });

            if (sqlError) {
                this.logger.error(`Migration ${migration.version} failed`, sqlError);
                throw sqlError;
            }

            const executionTime = Date.now() - startTime;

            // Record the migration as applied
            const { error: recordError } = await this.supabase
                .from('schema_migrations')
                .insert({
                    version: migration.version,
                    name: migration.name,
                    checksum: migration.checksum,
                    execution_time_ms: executionTime
                });

            if (recordError) {
                this.logger.error(`Failed to record migration ${migration.version}`, recordError);
                throw recordError;
            }

            this.logger.info(`Migration ${migration.version} applied successfully in ${executionTime}ms`);
            return { success: true, executionTime };

        } catch (error) {
            this.logger.error(`Migration ${migration.version} failed`, error);
            throw error;
        }
    }

    // Apply all pending migrations
    async migrate() {
        this.logger.info('Starting database migration process');

        try {
            // Initialize migration table if needed
            await this.initializeMigrationTable();

            // Get pending migrations
            const pendingMigrations = await this.getPendingMigrations();

            if (pendingMigrations.length === 0) {
                this.logger.info('No pending migrations found');
                return { applied: 0, migrations: [] };
            }

            this.logger.info(`Found ${pendingMigrations.length} pending migrations`);

            const results = [];
            for (const migration of pendingMigrations) {
                const result = await this.applyMigration(migration);
                results.push({
                    version: migration.version,
                    name: migration.name,
                    ...result
                });
            }

            this.logger.info(`Successfully applied ${results.length} migrations`);
            return { applied: results.length, migrations: results };

        } catch (error) {
            this.logger.error('Migration process failed', error);
            throw error;
        }
    }

    // Rollback a specific migration (if rollback script exists)
    async rollback(version) {
        this.logger.info(`Attempting to rollback migration ${version}`);

        try {
            // Look for rollback file
            const rollbackFile = path.join(this.migrationDir, `${version}_rollback.sql`);
            
            try {
                const rollbackContent = await fs.readFile(rollbackFile, 'utf8');
                
                // Execute rollback SQL
                const { error: sqlError } = await this.supabase.rpc('exec_sql', {
                    sql: rollbackContent
                });

                if (sqlError) {
                    this.logger.error(`Rollback ${version} failed`, sqlError);
                    throw sqlError;
                }

                // Remove from migration table
                const { error: deleteError } = await this.supabase
                    .from('schema_migrations')
                    .delete()
                    .eq('version', version);

                if (deleteError) {
                    this.logger.error(`Failed to remove migration record ${version}`, deleteError);
                    throw deleteError;
                }

                this.logger.info(`Successfully rolled back migration ${version}`);
                return { success: true };

            } catch (fileError) {
                if (fileError.code === 'ENOENT') {
                    throw new Error(`Rollback file not found for migration ${version}`);
                }
                throw fileError;
            }

        } catch (error) {
            this.logger.error(`Rollback failed for migration ${version}`, error);
            throw error;
        }
    }

    // Get migration status
    async getStatus() {
        try {
            const appliedMigrations = await this.getAppliedMigrations();
            const pendingMigrations = await this.getPendingMigrations();

            return {
                applied: appliedMigrations.length,
                pending: pendingMigrations.length,
                appliedMigrations: appliedMigrations.map(m => ({
                    version: m.version,
                    name: m.name,
                    appliedAt: m.applied_at,
                    executionTime: m.execution_time_ms
                })),
                pendingMigrations: pendingMigrations.map(m => ({
                    version: m.version,
                    name: m.name,
                    filename: m.filename
                }))
            };
        } catch (error) {
            this.logger.error('Failed to get migration status', error);
            throw error;
        }
    }

    // Create a new migration file
    async createMigration(name) {
        const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
        const version = timestamp.slice(0, 8) + timestamp.slice(8, 14);
        const filename = `${version}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
        const filePath = path.join(this.migrationDir, filename);

        const template = `-- Migration: ${name}
-- Version: ${version}
-- Created: ${new Date().toISOString()}

-- TODO: Add your migration SQL here
-- Example:
-- CREATE TABLE example (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     name TEXT NOT NULL,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- TODO: Create corresponding rollback file: ${version}_rollback.sql
`;

        await fs.writeFile(filePath, template, 'utf8');
        this.logger.info(`Created migration file: ${filename}`);

        return {
            version,
            name,
            filename,
            path: filePath
        };
    }
}

module.exports = { MigrationManager };