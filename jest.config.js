let ignore = [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/plugins/',
    '<rootDir>/worlds/'
];

module.exports = {
    testEnvironment: 'node',
    clearMocks: true,
    moduleFileExtensions: [
        'ts',
        'js'
    ],
    reporters: [
        'default'
    ],
    testLocationInResults: true,
    testMatch: [
        '**/*.(test|spec).(ts|js)'
    ],
    modulePathIgnorePatterns: ignore,
    coverageReporters: [
        'json',
        'lcov',
        'text',
        'text-summary'
    ]
};
