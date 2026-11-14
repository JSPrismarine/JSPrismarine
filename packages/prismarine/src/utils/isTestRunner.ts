/** A process environment, or a stand-in for one that a test builds. */
export type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Whether the process runs under Vitest, which sets `VITEST` in every test worker. Code that would
 * contact a real outside service checks this, so a test run never does.
 * @param env - The environment to read. The process's own by default.
 */
export const isTestRunner = (env: Environment = process.env): boolean => Boolean(env.VITEST);
