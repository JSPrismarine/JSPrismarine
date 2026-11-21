import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findJdkHome } from './jdk.ts';

/**
 * A JDK home whose `java --version` says it is release 27, named by the search's own `JAVA_HOME`
 * rather than the process's, which test files on other threads read too (issue #3491).
 */
describe.skipIf(process.platform === 'win32')('findJdkHome with a highest release', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'jsp-jdk-release-'));
        await mkdir(join(root, 'bin'));
        await writeFile(join(root, 'bin', 'java'), "#!/bin/sh\necho 'openjdk 27 2026-09-15'\n");
        await chmod(join(root, 'bin', 'java'), 0o755);
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it('takes a newer JDK when only the lowest release is named', () => {
        expect(findJdkHome({ minimumMajor: 25 }, { env: { JAVA_HOME: root } })).toBe(root);
    });

    it('passes over a newer JDK when the highest release is named too', () => {
        // Another JDK 25 on the machine may still be found; this one never is.
        let found: string | undefined;
        try {
            found = findJdkHome({ minimumMajor: 25, maximumMajor: 25 }, { env: { JAVA_HOME: root } });
        } catch (error) {
            expect(String(error)).toContain('No JDK 25 providing java was found');
        }
        expect(found).not.toBe(root);
    });
});
