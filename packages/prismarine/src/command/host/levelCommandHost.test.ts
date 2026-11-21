/**
 * A command host per level: the scoreboard, the command storage, the clock and a dimension that
 * names no level are the level's the command runs in, not the entry level's.
 */
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { describe, expect, it } from 'vitest';

import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import { CommandStorage } from '../../world/CommandStorage';
import type { Level } from '../../world/Level';
import { Scoreboard } from '../../world/Scoreboard';
import type { World } from '../../world/World';
import type WorldManager from '../../world/WorldManager';
import { RandomSequences } from './randomSequences';
import { serverCommandHost } from './serverCommandHost';
import { dimensionInLevel } from './support';

/** A level with a scoreboard, a command storage and an Overworld at a time of day. */
const levelOf = (name: string, dayTime: number) => {
    const scoreboard = new Scoreboard();
    const overworld = stub<World>({ getDayTime: () => dayTime });
    const level = stub<Level>({
        name,
        getScoreboard: () => scoreboard,
        getCommandStorage: () => new CommandStorage(),
        loadedWorld: (stemId) => (stemId === OVERWORLD_STEM_ID ? overworld : undefined)
    });
    return { level, scoreboard };
};

describe('a command host of a level', () => {
    const entry = levelOf('main', 1000);
    const arena = levelOf('arena', 6000);
    const server = stub<Server>({
        getWorldManager: () => stub<WorldManager>({ getEntryLevel: () => entry.level })
    });
    const sequences = new RandomSequences(() => 1n);

    it('keeps score on its own level’s scoreboard, and reads its own level’s clock', () => {
        const host = serverCommandHost(
            server,
            () => {},
            sequences,
            () => arena.level
        );
        const entryHost = serverCommandHost(server, () => {}, sequences);

        expect(host.scoreboard.addObjective('kills', 'dummy')).toBe(true);

        expect(arena.scoreboard.has('kills')).toBe(true);
        expect(entry.scoreboard.has('kills')).toBe(false);
        expect(entryHost.scoreboard.listObjectives()).toEqual([]);
        expect(host.world.getTime()).toBe(6000);
        expect(entryHost.world.getTime()).toBe(1000);
    });

    it('places a dimension that names no level in the level, and leaves the entry level’s bare', () => {
        expect(dimensionInLevel(server, 'minecraft:overworld', arena.level)).toBe('minecraft:overworld@arena');
        expect(dimensionInLevel(server, 'minecraft:the_nether@other', arena.level)).toBe('minecraft:the_nether@other');
        expect(dimensionInLevel(server, 'minecraft:overworld', entry.level)).toBe('minecraft:overworld');
    });
});
