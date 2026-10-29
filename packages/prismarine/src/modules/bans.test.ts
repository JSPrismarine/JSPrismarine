import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestModule } from '@jsprismarine/kernel/testing';
import { Logger } from '@jsprismarine/logger';
import { bansModule } from './bans';
import { bansToken } from './tokens';

describe('modules/bans', () => {
    let directory: string;
    let logger: Logger;

    beforeEach(() => {
        directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-bans-module-test-'));
        vi.stubEnv('JSP_DIR', directory);
        logger = new Logger();
        vi.spyOn(logger, 'warn').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        rmSync(directory, { recursive: true, force: true });
    });

    it('provides a ban manager that loaded the ban file on start', async () => {
        writeFileSync(path.join(directory, 'banned-players.json'), '[{ "name": "player1", "reason": "griefing" }]');

        const handle = await startTestModule(bansModule({ getLogger: () => logger }));
        try {
            const bans = handle.get(bansToken);
            expect(bans.isBanned({ getName: () => 'player1' })).toBe('griefing');
            expect(bans.isBanned({ getName: () => 'someone-else' })).toBe(false);
        } finally {
            await handle.stop();
        }
    });

    it('clears the loaded list on stop', async () => {
        writeFileSync(path.join(directory, 'banned-players.json'), '[{ "name": "player1", "reason": "griefing" }]');

        const handle = await startTestModule(bansModule({ getLogger: () => logger }));
        const bans = handle.get(bansToken);
        await handle.stop();

        expect(bans.isBanned({ getName: () => 'player1' })).toBe(false);
    });
});
