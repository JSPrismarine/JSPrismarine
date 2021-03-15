const ignore = ['<rootDir>/node_modules/', '<rootDir>/dist/', '<rootDir>/plugins/', '<rootDir>/worlds/'];

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    clearMocks: true,
    moduleFileExtensions: ['js', 'ts'],
    reporters: ['default'],
    testLocationInResults: true,
    testMatch: ['**/*.(test|spec).(ts|js)'],
    modulePathIgnorePatterns: ignore,
    coverageReporters: ['json', 'lcov', 'text', 'text-summary']
};
