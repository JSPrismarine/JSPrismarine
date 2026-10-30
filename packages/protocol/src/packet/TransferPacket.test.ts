import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import { netIdFor } from '../wire/versions/v2193';
import UUID from '../wire/structures/UUID';
import TransferPacket from './TransferPacket';

import type { Transfer } from './TransferPacket';

const ADDRESS = 'play.example.org';
const EXPERIENCE_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const TARGET_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const bytesOf = (write: (stream: NetworkBinaryStream) => void): number[] => {
    const stream = new NetworkBinaryStream();
    write(stream);
    return [...stream.getBuffer()];
};
const stringBytes = (value: string): number[] => bytesOf((stream) => stream.writeString(value));
const uuidBytes = (value: string): number[] => bytesOf((stream) => UUID.fromString(value).networkSerialize(stream));

const WITHOUT_CONFIG: Transfer = { address: ADDRESS, port: 19132, reloadWorld: true, gatheringsConfig: null };
const WITH_CONFIG: Transfer = {
    address: ADDRESS,
    port: 19132,
    reloadWorld: false,
    gatheringsConfig: {
        experienceId: UUID.fromString(EXPERIENCE_ID),
        experienceName: 'Lobby',
        worldId: null,
        worldName: null,
        creatorId: 'creator-1',
        targetId: UUID.fromString(TARGET_ID),
        scenarioId: 'scenario-1',
        serverId: null
    }
};
const packetHead = [PacketIdentifier.TRANSFER, ...stringBytes(ADDRESS), 0xbc, 0x4a];
const WITHOUT_CONFIG_BYTES = Buffer.from([...packetHead, 0x01, 0x00]);
const WITH_CONFIG_BYTES = Buffer.from([
    ...packetHead,
    0x00,
    0x01,
    ...uuidBytes(EXPERIENCE_ID),
    ...stringBytes('Lobby'),
    0x00,
    0x00,
    ...stringBytes('creator-1'),
    0x01,
    ...uuidBytes(TARGET_ID),
    0x01,
    ...stringBytes('scenario-1'),
    0x00
]);

describe('TransferPacket', () => {
    it('writes a transfer without gatherings configuration', () => {
        expect(new TransferPacket(WITHOUT_CONFIG).serialize(new NetworkBinaryStream())).toEqual(WITHOUT_CONFIG_BYTES);
    });

    it('writes a configuration with presence bytes for each optional field', () => {
        expect(new TransferPacket(WITH_CONFIG).serialize(new NetworkBinaryStream())).toEqual(WITH_CONFIG_BYTES);
    });

    it('reads both transfer forms to the end of the packet', () => {
        const withoutConfig = new NetworkBinaryStream(WITHOUT_CONFIG_BYTES);
        const withConfig = new NetworkBinaryStream(WITH_CONFIG_BYTES);

        expect(new TransferPacket().deserialize(withoutConfig)).toEqual(WITHOUT_CONFIG);
        expect(withoutConfig.feof()).toBe(true);
        const decoded = new TransferPacket().deserialize(withConfig);
        expect(decoded.address).toBe(ADDRESS);
        expect(decoded.port).toBe(19132);
        expect(decoded.reloadWorld).toBe(false);
        expect(decoded.gatheringsConfig?.experienceId.toString()).toBe(EXPERIENCE_ID);
        expect(decoded.gatheringsConfig?.experienceName).toBe('Lobby');
        expect(decoded.gatheringsConfig?.worldId).toBeNull();
        expect(decoded.gatheringsConfig?.worldName).toBeNull();
        expect(decoded.gatheringsConfig?.creatorId).toBe('creator-1');
        expect(decoded.gatheringsConfig?.targetId?.toString()).toBe(TARGET_ID);
        expect(decoded.gatheringsConfig?.scenarioId).toBe('scenario-1');
        expect(decoded.gatheringsConfig?.serverId).toBeNull();
        expect(withConfig.feof()).toBe(true);
    });

    it('uses the protocol 2193 packet id', () => {
        expect(netIdFor('TransferPacket')).toBe(PacketIdentifier.TRANSFER);
    });
});
