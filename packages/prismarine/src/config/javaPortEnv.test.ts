import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { javaPortFromEnv } from './javaPortEnv';
import { JAVA_PORT_ENV } from './javaPortEnvName';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('JSP_JAVA_PORT', () => {
    it('leaves java-port to the file when it is unset or empty', () => {
        vi.stubEnv(JAVA_PORT_ENV, undefined);
        expect(javaPortFromEnv()).toBeUndefined();
        vi.stubEnv(JAVA_PORT_ENV, ' ');
        expect(javaPortFromEnv()).toBeUndefined();
    });

    it('names the port, 0 asking the operating system for a free one', () => {
        vi.stubEnv(JAVA_PORT_ENV, '25566');
        expect(javaPortFromEnv()).toBe(25_566);
        vi.stubEnv(JAVA_PORT_ENV, '0');
        expect(javaPortFromEnv()).toBe(0);
    });

    it('refuses a value that is not a TCP port', () => {
        for (const value of ['-1', '65536', '25565.5', 'java', '0x10']) {
            vi.stubEnv(JAVA_PORT_ENV, value);
            expect(() => javaPortFromEnv()).toThrow(PrismarineServerErrors.JavaPortEnvInvalid);
        }
    });
});
