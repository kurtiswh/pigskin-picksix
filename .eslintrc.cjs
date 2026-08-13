/**
 * ESLint config.
 *
 * The dependencies for this (eslint, @typescript-eslint/*, react-hooks,
 * react-refresh) have been in package.json since the project was scaffolded,
 * but no config file ever existed — so `npm run lint` has always failed with
 * "couldn't find a configuration file" rather than linting anything.
 *
 * The rule selection below is deliberately narrow. Turning on the full
 * recommended set produces thousands of findings on a codebase this size, and a
 * gate nobody can pass is the same as no gate — which is how the project got
 * here. These are the rules that catch bugs rather than style: unused code that
 * signals a refactor left half-done, hook dependency mistakes, and the handful
 * of genuinely dangerous JS patterns. Tighten it as the count comes down.
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    'build',
    '.eslintrc.cjs',
    'scripts/archive',
    'supabase/functions', // Deno, not Node — different globals and import style
    '**/*.js',
    '**/*.cjs',
    '**/*.mjs',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-refresh'],
  rules: {
    // `any` is everywhere in this codebase already; flagging each one buries
    // the findings that matter. Revisit once the count is manageable.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'none',
    }],
    // Empty catch blocks that swallow an error silently are worth seeing.
    'no-empty': ['warn', { allowEmptyCatch: false }],
    'react-refresh/only-export-components': 'off',
    // `let { data, error } = await supabase...` then reassigning `data` on a
    // fallback is all over this codebase and is correct. Only complain when
    // every binding in the pattern could have been const.
    'prefer-const': ['error', { destructuring: 'all' }],
    // `while (true) { ... break }` is a deliberate loop, not a mistake.
    'no-constant-condition': ['error', { checkLoops: false }],
  },
}
