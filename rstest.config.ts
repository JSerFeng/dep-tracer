import { defineConfig } from '@rstest/core';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
