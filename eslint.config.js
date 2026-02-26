import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    extends: [
      ...tseslint.configs.all,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Chess is inherently mathematical — positions, indices, board geometry
      '@typescript-eslint/no-magic-numbers': 'off',
      // Functions are hoisted in JS — defining helpers after main logic is idiomatic
      '@typescript-eslint/no-use-before-define': ['error', { functions: false }],
      // External library types (chessops, chessground) are not readonly
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
      // Conflicts with switch/let patterns
      '@typescript-eslint/init-declarations': 'off',
      // Some functions naturally need multiple params (e.g. makeMove)
      '@typescript-eslint/max-params': ['error', { max: 5 }],
    },
  },
  prettier,
);
