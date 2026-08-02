import { defineConfig } from 'vitest/config';

// css: true stops Vitest from stubbing CSS imports to an empty string, which is
// what style.test.ts reads to check the chrome stays on the pixel grid.
export default defineConfig({ test: { css: true } });
