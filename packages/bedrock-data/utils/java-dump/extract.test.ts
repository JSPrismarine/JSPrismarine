import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractServer, type Unzip } from './extract.ts';

const VERSION = '26.3';
let cacheDir: string;

beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'jsp-java-extract-'));
});

afterEach(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true });
});

const writeFile = (file: string, contents = ''): void => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
};

const serverJarIn = (destination: string): string =>
    path.join(destination, 'META-INF/versions', VERSION, `server-${VERSION}.jar`);

/** Records each call and writes the bundler layout the real jar unpacks to. */
const recordingUnzip = (): { calls: number; unzip: Unzip } => {
    const recorder = {
        calls: 0,
        unzip: ((_archive, _patterns, destination) => {
            recorder.calls++;
            writeFile(serverJarIn(destination), 'server');
            writeFile(path.join(destination, 'META-INF/libraries/com/example/lib/1.0/lib-1.0.jar'), 'lib');
        }) satisfies Unzip
    };
    return recorder;
};

describe('extractServer', () => {
    it('extracts the libraries when ensure:java-server left only the inner server jar', () => {
        writeFile(serverJarIn(path.join(cacheDir, 'extracted')), 'server');
        const recorder = recordingUnzip();

        const { librariesDir } = extractServer('bundler.jar', cacheDir, VERSION, recorder.unzip);

        expect(recorder.calls).toBe(1);
        expect(fs.readdirSync(librariesDir)).toEqual(['lib-1.0.jar']);
    });

    it('skips the unzip when the server jar and libraries are both extracted', () => {
        const recorder = recordingUnzip();
        extractServer('bundler.jar', cacheDir, VERSION, recorder.unzip);

        const { serverJar, librariesDir } = extractServer('bundler.jar', cacheDir, VERSION, recorder.unzip);

        expect(recorder.calls).toBe(1);
        expect(serverJar).toBe(serverJarIn(path.join(cacheDir, 'extracted')));
        expect(fs.readdirSync(librariesDir)).toEqual(['lib-1.0.jar']);
    });
});
