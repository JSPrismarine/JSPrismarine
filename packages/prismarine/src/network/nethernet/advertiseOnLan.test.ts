import { describe, expect, it } from 'vitest';

import { ServerName } from '@jsprismarine/raknet';
import { advertiseOnLan, lanNonce } from './advertiseOnLan';
import { decodeLanAdvertisement } from '@jsprismarine/nethernet';

const serverName = () =>
    new ServerName(
        { getConfig: () => ({ getMotd: () => 'Hello', getGamemode: () => 'survival', getMaxPlayers: () => 20 }) },
        { protocolVersion: 2193, minecraftVersions: ['1.26.51'] }
    );

describe('network/nethernet/advertiseOnLan', () => {
    it('advertises at once and again whenever the server name changes, until stopped', () => {
        const name = serverName();
        name.setName('JSPrismarine');
        const sent: Buffer[] = [];
        const stop = advertiseOnLan({ setAdvertisement: (buffer) => void sent.push(buffer) }, name, true, 'n');

        name.setOnlinePlayerCount(2);
        stop();
        name.setOnlinePlayerCount(3);

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
