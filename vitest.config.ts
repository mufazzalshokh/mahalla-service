import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/main.ts',
        'src/infrastructure/database/migrate.ts',
        'src/infrastructure/database/schema.ts',
        'src/infrastructure/database/seed.ts',
        'src/interfaces/telegram/resident-bot.ts',
        'src/interfaces/telegram/staff-bot.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        'src/application/intake/resident-intake-planner.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        'src/domain/**/*state-machine.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        'src/domain/duplicates/duplicate-confidence.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        'src/domain/priority/priority-calculator.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        'src/domain/execution/work-evidence-policy.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        'src/domain/quality/quality-policy.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    environment: 'node',
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
  },
});
