// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions are Deno (jsr: imports, Deno globals) — linted by the Supabase
    // toolchain, not the Expo/RN eslint config.
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
