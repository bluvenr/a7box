import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // Global ignores
  { ignores: ['dist/', 'src-tauri/target/', 'node_modules/', 'tmp/', 'pages/'] },

  // Base recommended rules
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // React + TypeScript rules
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Relaxed rules for pragmatic codebase
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Allow void for fire-and-forget (Tauri IPC calls)
      '@typescript-eslint/no-floating-promises': 'off',

      // Intentional patterns in this codebase
      'react-hooks/exhaustive-deps': 'warn',     // Many intentional omissions (stable callbacks, stores)
      'react-hooks/refs': 'warn',                 // CachedOutlet deliberately reads refs in render for keep-alive
      'react-hooks/purity': 'warn',               // Allow controlled side effects in render
      'react-hooks/set-state-in-effect': 'warn',  // Fire-and-forget IPC callbacks often setState in effect
      'react-hooks/use-memo': 'off',               // useCallback with type-cast is common pattern

      // Relaxed JS rules
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'prefer-const': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn', // Ternary used as statement (e.g. cond ? fn() : noop)
      '@typescript-eslint/no-unsafe-function-type': 'warn', // Allow `Function` type in generic utils
      'react-hooks/immutability': 'warn',                    // React 19 compiler: variable access patterns
      'react-hooks/static-components': 'warn',               // React 19 compiler: component creation patterns
      'react-hooks/preserve-manual-memoization': 'warn',     // React 19 compiler: memoization preservation
      'preserve-caught-error': 'warn',                        // Not all re-throws need cause attached
    },
  },

  // Disable formatting rules that conflict with Prettier
  prettier,
)
