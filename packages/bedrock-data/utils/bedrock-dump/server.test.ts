import { constants } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COMMON_PROPERTIES, READY_LINE, renderServerProperties, stageServer, startServer } from './server.ts';

let workspace: string;

beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'jsp-bedrock-dump-'));
});

afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
});

describe('renderServerProperties', () => {
    const shipped = ['# A comment', 'level-name=Bedrock level', 'online-mode=true', 'view-distance=32'].join('\n');

    it('rewrites a key in place and leaves the rest alone', () => {
        expect(renderServerProperties(shipped, { 'online-mode': 'false' })).toBe(
            ['# A comment', 'level-name=Bedrock level', 'online-mode=false', 'view-distance=32', ''].join('\n')
        );
    });

    it('appends a key the shipped file does not have', () => {
        expect(renderServerProperties(shipped, { 'level-seed': '12345' })).toContain('\nlevel-seed=12345\n');
    });

    it('does not rewrite a commented out key', () => {
        expect(renderServerProperties('#online-mode=true', { 'online-mode': 'false' })).toBe(
            '#online-mode=true\nonline-mode=false\n'
        );
    });
});

/** An archive with the shape the staging step reads, and a world it must not copy. */
const fakeArchive = async (root: string): Promise<string> => {
    await mkdir(join(root, 'behavior_packs', 'vanilla'), { recursive: true });
    await mkdir(join(root, 'worlds', 'Bedrock level'), { recursive: true });
    await writeFile(join(root, 'behavior_packs', 'vanilla', 'manifest.json'), '{}');
    await writeFile(join(root, 'server.properties'), 'level-name=Bedrock level\nonline-mode=true\n');
    // The zip reader writes every entry as a plain file, so this is how the binary arrives.
    await writeFile(join(root, 'bedrock_server'), '#!/bin/sh\nexit 0\n', { mode: 0o644 });
    return root;
};

describe('stageServer', () => {
    it('copies the archive, skips its world, and makes the binary executable', async () => {
        const unpacked = await fakeArchive(join(workspace, 'unpacked'));
        const staged = await stageServer({ unpacked, root: join(workspace, 'run') });

        await expect(access(staged.binary, constants.X_OK)).resolves.toBeUndefined();
        expect((await stat(join(staged.root, 'behavior_packs', 'vanilla', 'manifest.json'))).isFile()).toBe(true);
        await expect(stat(join(staged.root, 'worlds', 'Bedrock level'))).rejects.toThrow();
        expect((await stat(staged.worldDirectory)).isDirectory()).toBe(true);
    });

    it.skipIf(process.platform === 'win32')('leaves the binary inside the archive unexecutable', async () => {
        const unpacked = await fakeArchive(join(workspace, 'unpacked'));
        await stageServer({ unpacked, root: join(workspace, 'run') });
        await expect(access(join(unpacked, 'bedrock_server'), constants.X_OK)).rejects.toThrow();
    });

    it('writes the properties every pass needs on top of the shipped file', async () => {
        const unpacked = await fakeArchive(join(workspace, 'unpacked'));
        const staged = await stageServer({
            unpacked,
            root: join(workspace, 'run'),
            properties: { 'level-seed': '99' },
            levelName: 'reference'
        });

        const written = await readFile(join(staged.root, 'server.properties'), 'utf8');
        for (const [key, value] of Object.entries(COMMON_PROPERTIES)) expect(written).toContain(`${key}=${value}`);
        expect(written).toContain('level-seed=99');
        expect(written).toContain('level-name=reference');
        expect(staged.worldDirectory).toBe(join(staged.root, 'worlds', 'reference'));
    });

    it('reuses the copy on a second run and starts the world again', async () => {
        const unpacked = await fakeArchive(join(workspace, 'unpacked'));
        const first = await stageServer({ unpacked, root: join(workspace, 'run') });
        await writeFile(join(first.worldDirectory, 'level.dat'), 'stale');
        await writeFile(join(first.root, 'behavior_packs', 'marker'), 'kept');

        const second = await stageServer({ unpacked, root: join(workspace, 'run') });
        expect(await readFile(join(second.root, 'behavior_packs', 'marker'), 'utf8')).toBe('kept');
        await expect(stat(join(second.worldDirectory, 'level.dat'))).rejects.toThrow();
    });
});

/**
 * A stand-in for the real server: it prints a banner, the ready line, then whatever the console
 * tells it to, and exits on `stop`. The real binary is a Linux x86-64 ELF and cannot run here.
 */
const FAKE_SERVER = `
const lines = [];
process.stdout.write('[INFO] Starting Server\\n');
process.stdout.write('[INFO] ${READY_LINE}.\\n');
process.stdin.setEncoding('utf8');
let buffered = '';
process.stdin.on('data', (chunk) => {
    buffered += chunk;
    let at;
    while ((at = buffered.indexOf('\\n')) >= 0) {
        const command = buffered.slice(0, at).trim();
        buffered = buffered.slice(at + 1);
        if (command === 'stop') {
            process.stdout.write('[INFO] Stopping server...\\n');
            process.exit(0);
        }
        process.stderr.write('[INFO] [Scripting] ' + command + '\\n');
    }
});
`;

const startFake = async (body: string) => {
    const script = join(workspace, 'fake-server.mjs');
    await writeFile(script, body);
    await chmod(script, 0o644);
    return startServer({ command: process.execPath, args: [script], cwd: workspace });
};

describe('startServer', () => {
    it('waits for the ready line, relays console commands and stops cleanly', async () => {
        const server = await startFake(FAKE_SERVER);
        await server.waitForLine((line) => line.includes(READY_LINE), 'the ready line', 5000);

        server.send('DUMP items {"id":"minecraft:stone"}');
        const echoed = await server.waitForLine((line) => line.includes('DUMP items'), 'the row', 5000);
        expect(echoed).toContain('minecraft:stone');

        expect(await server.stop(5000)).toBe(0);
        expect(server.lines).toContain('[INFO] Stopping server...');
    });

    it('matches a line that arrived before the wait started', async () => {
        const server = await startFake(FAKE_SERVER);
        await server.waitForLine((line) => line.includes(READY_LINE), 'the ready line', 5000);
        await expect(
            server.waitForLine((line) => line.includes('Starting Server'), 'the banner', 5000)
        ).resolves.toContain('Starting Server');
        await server.stop(5000);
    });

    it('fails the wait when the server exits first', async () => {
        const server = await startFake("process.stdout.write('[INFO] Quitting\\n');\n");
        await expect(server.waitForLine((line) => line.includes(READY_LINE), 'the ready line', 5000)).rejects.toThrow(
            /exited/
        );
    });

    it('ignores past lines before fromIndex, so a repeated answer is not matched twice', async () => {
        const server = await startFake(FAKE_SERVER);
        await server.waitForLine((line) => line.includes(READY_LINE), 'the ready line', 5000);

        server.send('Data saved');
        await server.waitForLine((line) => line.includes('Data saved'), 'the first save', 5000);

        const from = server.lines.length;
        await expect(
            server.waitForLine((line) => line.includes('Data saved'), 'a second save', 150, from)
        ).rejects.toThrow(/Waited 150 ms/);

        server.send('Data saved');
        await expect(
            server.waitForLine((line) => line.includes('Data saved'), 'the second save', 5000, from)
        ).resolves.toContain('Data saved');
        await server.stop(5000);
    });

    it('fails the wait when the line never comes', async () => {
        const server = await startFake(FAKE_SERVER);
        await expect(server.waitForLine((line) => line.includes('never'), 'a line nobody writes', 150)).rejects.toThrow(
            /Waited 150 ms/
        );
        await server.stop(5000);
    });
});
