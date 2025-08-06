module.exports = {
    // Test environment
    testEnvironment: 'node',
    
    // Test file patterns
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],
    
    // Coverage configuration
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/__tests__/**',
        '!src/**/test-*.js'
    ],
    
    // Coverage thresholds
    coverageThreshold: {
        global: {
            branches: 60,
            functions: 60,
            lines: 60,
            statements: 60
        }
    },
    
    // Transform files
    transform: {},
    
    // Module name mapper for path aliases
    moduleNameMapper: {
        '^@shared/(.*)$': '<rootDir>/src/shared/$1',
        '^@functions/(.*)$': '<rootDir>/src/functions/$1'
    },
    
    // Setup files
    setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
    
    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/logs/',
        '/bin/',
        '/obj/'
    ],
    
    // Verbose output
    verbose: true
};