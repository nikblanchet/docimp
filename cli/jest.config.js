export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  modulePaths: ['<rootDir>/src'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'esnext',
          isolatedModules: true,
        },
        diagnostics: {
          ignoreCodes: [151002, 1343],
        },
      },
    ],
    '^.+\\.js$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'esnext',
          allowJs: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|cli-table3|ora|prompts|uuid|ansi-regex|strip-ansi|ansi-styles|#ansi-styles)/)',
  ],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).ts',
    '**/?(*.)+(spec|test).js',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
