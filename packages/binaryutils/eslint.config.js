const tseslint = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');

module.exports = [
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: parser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module'
            }
        },
        plugins: {
            '@typescript-eslint': tseslint
        },
        rules: {
            // TypeScript specific
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off', // We use ! safely

            // General
            'no-console': 'warn',
            'no-fallthrough': 'off',
            'no-case-declarations': 'off',
            'semi': ['error', 'always'],
            'indent': ['error', 4, { SwitchCase: 1 }],
            'brace-style': ['error', '1tbs', { allowSingleLine: true }],
            'consistent-return': 'warn',
            'no-mixed-operators': 'off',
            'radix': 'off'
        }
    },
    {
        files: ['**/*.test.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off'
        }
    },
    {
        ignores: ['dist/**', 'node_modules/**', '*.js', '!eslint.config.js']
    }
];
