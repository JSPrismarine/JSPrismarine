import { describe, expect, it } from 'vitest';

import { addedPacketIds, removedPacketNames } from '@jsprismarine/protocol/wire/versions/v2259';
import Codec2225 from './Codec2225';
import Codec2259 from './Codec2259';
import { advertisedCodec, codecForProtocol, latestCodec } from './CodecRegistry';

describe('network/codec/Codec2259', () => {
    it('is the preview the registry negotiates but does not advertise', () => {
        expect(Codec2259.preview).toBe(true);
        expect(codecForProtocol(2259)).toBe(Codec2259);
        expect(latestCodec).toBe(Codec2259);
        expect(advertisedCodec).not.toBe(Codec2259);
    });

    it('has no id for the packets 2259 removed', () => {
        for (const name of removedPacketNames) {
            expect(Codec2225.netIdOf(name), name).toBeDefined();
            expect(Codec2259.netIdOf(name), name).toBeUndefined();
        }
    });

    it('builds a packet for every id 2259 added', () => {
        for (const [name, id] of Object.entries(addedPacketIds)) {
            expect(Codec2259.netIdOf(name), name).toBe(id);
            expect(Codec2259.createPacket(id)?.constructor.name, name).toBe(name);
        }
    });

    it('numbers items from its own capture rather than 2225s', () => {
        const { table } = Codec2259.itemData;

        expect(table['minecraft:ice_ball']).toBeDefined();
        expect(Codec2225.itemData.table['minecraft:ice_ball']).toBeUndefined();
        expect(Codec2259.itemData.nameOf(table['minecraft:ice_ball']!.runtime_id)).toBe('minecraft:ice_ball');
    });
});
