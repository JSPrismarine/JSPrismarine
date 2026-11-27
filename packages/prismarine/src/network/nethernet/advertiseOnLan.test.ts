import { describe, expect, it } from 'vitest';

import { decodeLanAdvertisement } from '@jsprismarine/nethernet';

import { ServerStatus } from '../ServerStatus';
import { advertiseOnLan, lanNonce } from './advertiseOnLan';

const serverStatus = () =>
    new ServerStatus({
        motd: 'Hello',
        levelName: 'JSPrismarine',
        onlinePlayers: 0,
        maxPlayers: 20,
        protocol: 2193,
        version: '1.26.51',
        gamemode: 'survival'
    });

describe('network/nethernet/advertiseOnLan', () => {
    it('advertises at once and again whenever the status changes, until stopped', () => {
        const status = serverStatus();
        const sent: Buffer[] = [];
        const stop = advertiseOnLan({ setAdvertisement: (buffer) => void sent.push(buffer) }, status, true, 'n');

        status.setBase({ onlinePlayers: 2 });
        status.override({}, { motd: 'Hello' });
        stop();
        status.setBase({ onlinePlayers: 3 });

        expect(sent.map((buffer) => decodeLanAdvertisement(buffer).playerCount)).toStrictEqual([0, 2]);
        expect(decodeLanAdvertisement(sent[0]!)).toMatchObject({
            motd: 'Hello',
            levelName: 'JSPrismarine',
            nonce: 'n'
        });
    });

    it('makes nonces of up to 16 hex digits that differ between starts', () => {
        const nonces = new Set(Array.from({ length: 8 }, lanNonce));

        expect(nonces.size).toBe(8);
        for (const nonce of nonces) expect(nonce).toMatch(/^[0-9a-f]{1,16}$/);
    });
});
