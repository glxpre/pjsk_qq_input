import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // .claude 里是工具状态与 worktrees（内含各分支自己的源码副本），不属于本项目源码
    ignores: ['dist', 'dist-toy', 'dev-dist', '**/dist', '**/dist-toy', '*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    settings: { react: { version: '18.2' } },
  },
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        browser: 'readonly',
        console: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react/jsx-no-target-blank': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  }
)
