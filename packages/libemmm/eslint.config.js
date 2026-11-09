import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintReact from "@eslint-react/eslint-plugin";

export default defineConfig([
    globalIgnores(['**/temp.ts']),
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        files: ["**/*.{ts,tsx}"],
        extends: [
            eslintReact.configs["recommended-typescript"],
        ],
        languageOptions: {
            globals: globals.browser,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
			"no-unused-vars": "off",
			"no-redeclare": "off",
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            "@typescript-eslint/no-unused-vars": ["error", {
                "argsIgnorePattern": "^_",
                "destructuredArrayIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
            }],
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/await-thenable": {
                "allowMixedPromiseArrays": true
            },
            "@eslint-react/rules-of-hooks": "off",
            "@eslint-react/no-missing-key": "off",
        },
    },
    {
        files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
        ...tseslint.configs.disableTypeChecked,
    }
]);
