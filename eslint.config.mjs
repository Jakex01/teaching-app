// Lint rules for the whole monorepo: correctness (TypeScript, React hooks, Next.js) and security.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/.data/**', '**/dist/**', '**/next-env.d.ts', 'packages/db/drizzle/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Security basics that apply everywhere.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },

  // Security: no raw HTML sinks (innerHTML, insertAdjacentHTML, document.write…).
  noUnsanitized.configs.recommended,

  // Security: Node.js pitfalls (unsafe regexes, child_process, dynamic require…).
  {
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      // Flags every obj[key]; far too noisy for TypeScript code where keys are typed.
      'security/detect-object-injection': 'off',
    },
  },

  // React and Next.js.
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/board/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
    settings: { next: { rootDir: 'apps/web' } },
  },
);
