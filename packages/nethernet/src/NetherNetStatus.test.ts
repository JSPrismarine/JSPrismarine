import { describe, expect, it } from 'vitest';

import { decodeJoinStatus, joinStatusJson } from './NetherNetStatus';

describe('NetherNetStatus', () => {
    it('answers GET /v1/join with the body Bedrock Dedicated Server sends', () => {
        // Captured from Bedrock Dedicated Server 1.26.51.1 with its default settings on 2026-11-10.
        expect(
            joinStatusJson({
                motd: 'Dedicated Server',
                levelName: 'Bedrock level',
                protocol: 2193,
                version: '1.26.51',
                playerCount: 0,
                maxPlayers: 10,
                gameType: 0
            })
        ).toBe(
            '{"name":"Dedicated Server","protocol":2193,"version":"1.26.51","level":"Bedrock level","players":0,"maxPlayers":10,"gameType":0}'
        );
    });

    it('reads a join status back, and refuses one missing a field', () => {
        const status = {
            motd: 'M',
            levelName: 'L',
            protocol: 1,
            version: 'v',
            playerCount: 2,
            maxPlayers: 3,
            gameType: 1
        };

        expect(decodeJoinStatus(joinStatusJson(status))).toStrictEqual(status);
        expect(() => decodeJoinStatus('{"name":"M"}')).toThrow('no number protocol');
    });
});
