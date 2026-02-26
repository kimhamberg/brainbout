import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    extends: [...tseslint.configs.all],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Chess is inherently mathematical — positions, indices, board geometry
      '@typescript-eslint/no-magic-numbers': 'off',
      // External library types (chessops, chessground) are not readonly
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
      // Module-level let game/engine are initialized in async main() before any use
      '@typescript-eslint/init-declarations': 'off',
      // 4-param functions (makeMove, goWithMoves) read better than options objects
      '@typescript-eslint/max-params': ['error', { max: 5 }],
      // Type boundaries with chessground/chessops and Vite's import.meta.env
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  prettier,
);
