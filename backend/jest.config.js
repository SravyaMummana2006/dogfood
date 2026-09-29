/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/env-setup.ts'],
  testMatch: ['**/*.test.ts'],
  verbose: true,
  testTimeout: 30000,
  forceExit: true,
};
