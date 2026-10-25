import pkg from '../package.json' with { type: 'json' };

/**
 * Version of the console package, read from its `package.json` at build time.
 */
export const CONSOLE_VERSION: string = pkg.version;
