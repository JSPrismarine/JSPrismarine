import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';

import { JAVA_PORT_ENV } from './javaPortEnvName';

/**
 * The Java Edition port `JSP_JAVA_PORT` asks for, which takes the place of `java-port` from the
 * file. The test setup sets it to 0, so the servers tests start never contend for 25565.
 * @returns The port, or undefined when the variable is unset or empty.
 * @throws {PrismarineServerErrors.JavaPortEnvInvalid} When it is not a port from 0 to 65535.
 */
export const javaPortFromEnv = (): number | undefined => {
    const value = process.env[JAVA_PORT_ENV]?.trim();
    if (value === undefined || value === '') return undefined;
    const port = Number(value);
    if (!/^\d+$/.test(value) || port > 65_535) throw new PrismarineServerErrors.JavaPortEnvInvalid({ value });
    return port;
};
