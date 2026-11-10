import { describe, expect, it } from 'vitest';

import { decodeLanAdvertisement, encodeLanAdvertisement, lanAdvertisementOf } from './LanAdvertisement';
import type { LanAdvertisement } from './LanAdvertisement';
import type { NetherNetStatus } from './NetherNetStatus';

/**
 * What Bedrock Dedicated Server 1.26.51.1 answered a discovery request on UDP 7551 with, captured
 * on 2026-11-10 with `server-name=Probe MOTD`, `level-name=Probe Level`, `max-players=10`,
 * `online-mode=false` and a survival world.
 */
const BDS_ADVERTISEMENT = Buffer.from(
    '070a50726f6265204d4f5444a22207312e32362e35310b50726f6265204c6576656c001400000001010f34663463613336343263393033613208',
    'hex'
);

const BDS_FIELDS: LanAdvertisement = {
    motd: 'Probe MOTD',
    levelName: 'Probe Level',
    protocol: 2193,
    version: '1.26.51',
    playerCount: 0,
    maxPlayers: 10,
    gameType: 0,
    editorWorld: false,
    hardcore: false,
    acceptsOnlineAuth: true,
    acceptsSelfSignedAuth: true,
    nonce: '4f4ca3642c903a2',
    connectionType: 4
};

describe('network/nethernet/LanAdvertisement', () => {
    it('decodes what Bedrock Dedicated Server advertises', () => {
        expect(decodeLanAdvertisement(BDS_ADVERTISEMENT)).toStrictEqual(BDS_FIELDS);
    });

    it('encodes the same fields to the same bytes', () => {
        expect(encodeLanAdvertisement(BDS_FIELDS).toString('hex')).toBe(BDS_ADVERTISEMENT.toString('hex'));
    });

    it('adds what only the LAN advertisement says to the shared status', () => {
        const status: NetherNetStatus = {
            motd: 'A server',
            levelName: 'world',
            protocol: 2193,
            version: '1.26.51',
            playerCount: 3,
            maxPlayers: 20,
            gameType: 1
        };

        expect(lanAdvertisementOf(status, true, 'abc')).toStrictEqual({
            ...status,
            editorWorld: false,
            hardcore: false,
            // Bedrock Dedicated Server stops accepting self-signed logins in online mode.
            acceptsOnlineAuth: true,
            acceptsSelfSignedAuth: false,
            nonce: 'abc',
            connectionType: 4
        });
        expect(lanAdvertisementOf(status, false, 'abc').acceptsSelfSignedAuth).toBe(true);
    });

    it('refuses a layout it does not know', () => {
        expect(() => decodeLanAdvertisement(Buffer.from([4, 0]))).toThrow('Unsupported LAN advertisement version 4');
    });
});
