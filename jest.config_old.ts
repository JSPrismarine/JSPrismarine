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
                useESM: true,
            }
        ],
    },
    rootDir: './',
    // roots: ['<rootDir>'],
    moduleDirectories: ['node_modules', 'packages', '<rootDir>/packages/prismarine/src/utils/'],
    modulePaths: ['<rootDir>/packages/', '<rootDir>/node_modules/@jsprismarine/jsbinaryutils', '<rootDir>/node_modules/chalk'],
    modulePathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/dist/',
        '<rootDir>/plugins/',
        '<rootDir>/worlds/'
    ],
    resolver: "jest-ts-webcompat-resolver",
    // https://github.com/kulshekhar/ts-jest/issues/1057
    // moduleNameMapper: {
    //    '^(\\.{1,2}/.*)\\.[jt]s$': '$1',
    // },
    verbose: true
};

export default jestConfig;