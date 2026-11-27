/**
 * The environment variable that overrides `java-port`, as `JSP_DIR` overrides the data directory.
 *
 * It lives in a module with no imports because the Vitest setup file reads it, and every test file
 * loads the setup file: anything this module imported would put every test file in the reach of a
 * change to it, so `--changed` and `--since-last-run` would run the whole suite.
 */
export const JAVA_PORT_ENV = 'JSP_JAVA_PORT';
