/* Плоский конфиг ESLint 9. vendor/ не линтуем - это чужой минифицированный код. */

const browser = {
  chrome: 'readonly',
  console: 'readonly',
  document: 'readonly',
  location: 'readonly',
  window: 'readonly',
  self: 'readonly',
  navigator: 'readonly',
  fetch: 'readonly',
  Blob: 'readonly',
  URL: 'readonly',
  Uint8Array: 'readonly',
  MutationObserver: 'readonly',
  requestAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  globalThis: 'readonly',
};

export default [
  { ignores: ['vendor/**', 'node_modules/**'] },

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...browser,
        importScripts: 'readonly',
        FFmpegWASM: 'readonly',
        RASK: 'writable',
      },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      curly: ['error', 'multi-line'],
      'no-implicit-globals': 'off',
    },
  },

  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        Function: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
