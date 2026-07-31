import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import jsdocPlugin from "eslint-plugin-jsdoc";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";
import globals from "globals";

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    // JSDoc enforcement — see .claude/skills/jsdoc/SKILL.md.
    // publicOnly so private helpers stay silent; the rest of the rules stop
    // the "restate the type" anti-patterns (jsdoc/no-types) and require every
    // @param / @returns tag to carry a domain-meaningful description.
    //
    // The structural rules (tag-lines, no-types) are `warn` (not `error`) so
    // services that haven't migrated to the new template yet still pass lint;
    // missing-jsdoc on public exports is also `warn` per the user's call to
    // surface the drift without breaking the build.
    files: ["**/*.ts"],
    plugins: {
      jsdoc: jsdocPlugin,
    },
    rules: {
      "jsdoc/require-jsdoc": [
        "warn",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
          // Type aliases and interfaces derive their shape from the TS
          // signature; adding JSDoc duplicates the type without adding intent.
          // The skill still documents non-obvious shape semantics inline.
          contexts: [],
        },
      ],
      "jsdoc/no-types": "warn",
      "jsdoc/require-param-description": "warn",
      "jsdoc/require-returns-description": "warn",
      "jsdoc/check-param-names": "warn",
      "jsdoc/check-tag-names": ["warn", { definedTags: [] }],
      "jsdoc/tag-lines": ["warn", "never", { startLines: 1 }],
    },
  },
  {
    ignores: ["**/dist/**", "dist/**"],
  },
];
