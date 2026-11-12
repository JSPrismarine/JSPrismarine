import { describe, expect, it } from 'vitest';

import type { ServerNameSnapshot } from '@jsprismarine/raknet';
import { netherNetStatusOf } from './netherNetStatusOf';

const snapshot: ServerNameSnapshot = {
    motd: 'Dedicated Server',
    name: 'JSPrismarine',
    protocol: 2193,
    version: '1.26.51',
    onlinePlayers: 0,
    maxPlayers: 10,
    gamemode: 'survival',
    serverId: '1',
    port: 19132,
    portV6: 19133
};

describe('network/nethernet/netherNetStatusOf', () => {
    it('reads the status from the server name, with its software name as the level', () => {
        expect(netherNetStatusOf({ ...snapshot, gamemode: 'creative', onlinePlayers: 2 })).toStrictEqual({
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
