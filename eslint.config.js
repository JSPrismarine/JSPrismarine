import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-plugin-prettier/recommended';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default defineConfig([
    {
        ignores: [
            'node_modules/',
            '.test/',
            '.vitest/',
            'build/',
            'coverage/',
            'dist/',
            'jsp/',
            'public/',
            '**/*.json',
            '**/*.lock',
            '**/*.env',
            '**/*.log',
            '**/*.bak',
            '**/*.dat',
            '**/*.nbt',
            '**/vite.config.ts',
            '**/vitest.config.ts',
            'vitest.workspace.ts',
            'packages/bedrock-data/utils/build.js',
            'packages/bedrock-data/src/resources/'
        ]
    },

    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,

    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                project: [
                    './tsconfig.json',
                    './tsconfig.build.json',
                    './tsconfig.test.json',
                    './packages/**/tsconfig.json',
                    './packages/**/tsconfig.build.json',
                    './packages/**/tsconfig.test.json'
                ],
                tsconfigRootDir: import.meta.dirname
            }
        },
        plugins: {
            jsdoc,
            import: importPlugin,
            'unused-imports': unusedImports
        },
        rules: {
            '@typescript-eslint/consistent-type-exports': [
                'error',
                {
                    fixMixedExportsWithInlineTypeSpecifier: false
                }
            ],
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    fixStyle: 'separate-type-imports',
                    prefer: 'type-imports'
                }
            ],
            '@typescript-eslint/no-require-imports': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'warn',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-wrapper-object-types': 'off',
            '@typescript-eslint/no-this-alias': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            'no-empty': 'off',
            'no-prototype-builtins': 'off',
            'no-async-promise-executor': 'off',
            'no-fallthrough': 'off',
            'no-case-declarations': 'off',
            '@typescript-eslint/no-duplicate-enum-values': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            'prefer-const': 'off',
            'brace-style': [
                'error',
                '1tbs',
                {
                    allowSingleLine: true
                }
            ],
            'consistent-return': 'error',
            'import/first': 'off',
            'import/order': 'off',
            indent: 'off',
            'jsdoc/check-alignment': 'error',
            'jsdoc/check-indentation': 'off',
            'jsdoc/check-line-alignment': 'error',
            'jsdoc/check-param-names': 'warn',
            'jsdoc/check-property-names': 'error',
            'jsdoc/check-syntax': 'error',
            'jsdoc/check-types': 'error',
            'jsdoc/require-hyphen-before-param-description': 'error',
            'no-console': [
                'error',
                {
                    allow: ['debug', 'warn', 'error']
                }
            ],
            'no-mixed-operators': 'off',
            'no-unused-vars': 'off',
            'no-useless-constructor': 'off',
            'prettier/prettier': [
                'error',
                {
                    endOfLine: 'auto'
                }
            ],
            semi: 'off',
            'sort-imports': 'off',
            'unused-imports/no-unused-imports': 'error',
            'unused-imports/no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    varsIgnorePattern: '^_',
                    args: 'after-used',
                    argsIgnorePattern: '^_'
                }
            ]
        }
    }
]);
