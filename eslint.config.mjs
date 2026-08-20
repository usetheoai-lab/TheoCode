import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * The rules that hold the shape of the code, without the historical debt notes of the repository
 * this code came from. Every cap below measured ZERO violations on this tree when it was set, so
 * each one freezes a good state instead of announcing debt.
 */
export default tseslint.config(
  // `deadcode-output/` is the loop-deadcode-audit plugin's working directory (gitignored, like
  // `code-review-output`). Its scripts are throwaway analysis tooling, not project source.
  { ignores: ['dist/**', 'node_modules/**', 'deadcode-output/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // `tools/` and the dependency-cruiser config are Node CommonJS/ESM build scripts, not app source:
  // they run under Node with `module`/`require` in scope, which the app's browser-ish globals exclude.
  { ignores: ['tools/**', '.dependency-cruiser.cjs'] },
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'all', argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-dupe-keys': 'error',
      'no-constant-condition': 'error',
      complexity: ['error', 10],
      'max-depth': ['error', 4],
      'max-params': ['error', 6],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-classes-per-file': ['error', 1],
    },
  },
  {
    // Fail-fast discipline: a rejection handler that discards the error is the most expensive
    // silence this product can ship — a PTY, a sandbox or an agent that never dies. `no-empty`
    // ignores function bodies by design, so neither shape below is caught without this rule.
    // Best-effort cleanup opts out per line with a written rationale.
    files: ['packages/*/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name="catch"] > ArrowFunctionExpression:matches([body.type="Identifier"][body.name="undefined"], [body.type="Literal"][body.raw="null"], [body.type="UnaryExpression"][body.operator="void"])',
          message:
            'A rejection handler that discards the error. Handle it, propagate it, or record it on stderr — and if it is best-effort cleanup, use `// eslint-disable-next-line no-restricted-syntax -- <rationale>`.',
        },
        {
          selector:
            'CallExpression[callee.property.name="catch"] > ArrowFunctionExpression > BlockStatement[body.length=0]',
          message:
            'A rejection handler with an empty body. `no-empty` does not catch this shape (it ignores function bodies by design).',
        },
      ],
    },
  },
  {
    // B-073 follow-up — `max-lines-per-function` does not apply to a `describe` block.
    //
    // The rule caps a FUNCTION's responsibility: a body past ~60 lines is usually doing more than
    // one thing. A `describe` is not that. It is a declaration grouping sibling `it`s, and its
    // length is the number of behaviours under test — a quantity `rules/testing.md` wants HIGH.
    // Capping it pushes toward fewer cases or arbitrary splits, which is the rule working against
    // the thing it exists to protect.
    //
    // Surfaced rather than chosen: `per-session.test.ts` tripped the rule at 62 lines after the
    // repository's own `prettier` reformatted it. That file was never formatted (there is no
    // `prettier --check` job in CI), so nothing forced the collision until now. The `it` bodies
    // themselves are unaffected — this exempts the file, not the discipline: `complexity`,
    // `max-depth` and `max-params` still apply, and those are what catch a test doing too much.
    files: ['**/*.test.{ts,tsx,mts,mjs}'],
    rules: {
      'max-lines-per-function': 'off',
    },
  },
)
