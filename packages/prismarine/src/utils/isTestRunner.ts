/** A process environment, or a stand-in for one that a test builds. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** The environment variable Vitest sets in every test worker. The docs quote it. */
export const TEST_RUNNER_VARIABLE = 'VITEST';

/**
 * Whether the process runs under Vitest, which sets {@link TEST_RUNNER_VARIABLE} in every test worker. Code that would
 * contact a real outside service checks this, so a test run never does.
 * @param env - The environment to read. The process's own by default.
 */
export const isTestRunner = (env: Environment = process.env): boolean => Boolean(env[TEST_RUNNER_VARIABLE]);
