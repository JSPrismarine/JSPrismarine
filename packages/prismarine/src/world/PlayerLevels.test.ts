import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PlayerLevels } from './PlayerLevels';

const ARENA = '6e714018-3251-45c9-9c56-9188446848ce';

let scratch: string;
beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-player-levels-'));
});
afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
});

describe('PlayerLevels', () => {
    it('keeps the level a player was last in until they are back in the entry level', async () => {
        const file = path.join(scratch, 'player-levels.json');
        const first = new PlayerLevels(file, { info: () => {} });
        await first.load();
        await first.set('Steve', ARENA);
        await first.set('Alex', ARENA);
        await first.set('Alex', undefined);

        const second = new PlayerLevels(file, { info: () => {} });
        await second.load();

        expect(second.levelOf('Steve')).toBe(ARENA);
        expect(second.levelOf('Alex')).toBeUndefined();
        expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ schemaVersion: 1, players: { Steve: ARENA } });
    });
});
