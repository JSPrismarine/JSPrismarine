import { describe, expect, it } from 'vitest';

import type { ServerStatusSnapshot } from '../ServerStatus';
import { netherNetStatusOf } from './netherNetStatusOf';

const status: ServerStatusSnapshot = {
    motd: 'Dedicated Server',
    levelName: 'JSPrismarine',
    protocol: 2193,
    version: '1.26.51',
    onlinePlayers: 0,
    maxPlayers: 10,
    gamemode: 'survival'
};

describe('network/nethernet/netherNetStatusOf', () => {
    it('reads the status every transport advertises, with its second name as the level', () => {
        expect(netherNetStatusOf({ ...status, gamemode: 'creative', onlinePlayers: 2 })).toStrictEqual({
            motd: 'Dedicated Server',
            levelName: 'JSPrismarine',
            protocol: 2193,
            version: '1.26.51',
            playerCount: 2,
            maxPlayers: 10,
            gameType: 1
        });
    });
});
