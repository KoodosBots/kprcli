module.exports = {
    apps: [
      {
        name: 'telekpr-v2-bot',
        script: './bot.js',
        cwd: 'C:\\Users\\Work\\Desktop\\KprCLi\\Cli\\TeleKprV2',
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        max_memory_restart: '1G',
        env: {
          NODE_ENV: 'development',
          PORT: 3002
        },
        env_production: {
          NODE_ENV: 'production',
          PORT: 3002
        },
        log_file: './logs/combined.log',
        out_file: './logs/out.log',
        error_file: './logs/error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        time: true,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '30s',
        restart_delay: 10000,
        exp_backoff_restart_delay: 15000
      },
      {
        name: 'telekpr-v2-admin',
        script: './simple-admin.js',
        cwd: 'C:\\Users\\Work\\Desktop\\KprCLi\\Cli\\TeleKprV2',
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        max_memory_restart: '500M',
        env: {
          NODE_ENV: 'development',
          PORT: 8082
        },
        env_production: {
          NODE_ENV: 'production',
          PORT: 8082
        },
        log_file: './logs/admin-combined.log',
        out_file: './logs/admin-out.log',
        error_file: './logs/admin-error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        time: true,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '30s',
        restart_delay: 10000,
        exp_backoff_restart_delay: 15000
      }
    ]
  };
