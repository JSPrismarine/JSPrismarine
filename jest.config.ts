import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
    preset: 'ts-jest/presets/default-esm',
    clearMocks: true,
    moduleFileExtensions: ['ts', 'js'],
    testLocationInResults: true,
    testMatch: ['**/*.test.(ts|js)'],
    coverageReporters: ['json', 'lcov', 'text', 'text-summary'],
    extensionsToTreatAsEsm: ['.ts'],
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest', 
            {
                useESM: true
            }
        ]
    },
    rootDir: './',
    roots: ['<rootDir>'],
    moduleDirectories: ['node_modules', 'packages'],
    modulePaths: ['<rootDir>/packages/'],
    modulePathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/dist/',
        '<rootDir>/plugins/',
        '<rootDir>/worlds/'
    ],
    verbose: true
};

export default jestConfig;