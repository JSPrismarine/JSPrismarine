import { describe, expect, it } from 'vitest';

import type { ServerNameSnapshot } from '@jsprismarine/raknet';
import { joinStatusJson, netherNetStatusOf } from './NetherNetStatus';

const snapshot: ServerNameSnapshot = {
    motd: 'Dedicated Server',
    name: 'JSRakNet',
    protocol: 2193,
    version: '1.26.51',
    onlinePlayers: 0,
    maxPlayers: 10,
    gamemode: 'survival',
    serverId: '1',
    port: 19132
};

describe('network/nethernet/NetherNetStatus', () => {
    it('reads the status from the server name and the level', () => {
        expect(netherNetStatusOf({ ...snapshot, gamemode: 'creative', onlinePlayers: 2 }, 'world')).toStrictEqual({
            motd: 'Dedicated Server',
            levelName: 'world',
            protocol: 2193,
            version: '1.26.51',
            playerCount: 2,
            maxPlayers: 10,
            gameType: 1
        });
    });

    it('answers GET /v1/join with the body Bedrock Dedicated Server sends', () => {
        // Captured from Bedrock Dedicated Server 1.26.51.1 with its default settings on 2026-11-10.
        expect(joinStatusJson(netherNetStatusOf(snapshot, 'Bedrock level'))).toBe(
            '{"name":"Dedicated Server","protocol":2193,"version":"1.26.51","level":"Bedrock level","players":0,"maxPlayers":10,"gameType":0}'
        );
    });
});
