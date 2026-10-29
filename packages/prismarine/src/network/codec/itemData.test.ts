import { item_table } from '@jsprismarine/bedrock-data';
import { item_table as item_table_2225 } from '@jsprismarine/bedrock-data/v2225';
import { describe, expect, it } from 'vitest';

import Codec2193 from './Codec2193';
import Codec2225 from './Codec2225';
import HandshakeCodec from './HandshakeCodec';
import { itemData2193, itemData2225, itemDataForProtocol } from './itemData';

/** The four names 1.26.60 added; docs/research/protocol-2225-delta.md. */
const ADDED = [
    'minecraft:disc_press',
    'minecraft:frostbite_spawn_egg',
    'minecraft:ice_crystal',
    'minecraft:icicle'
] as const;

describe('network/codec/itemData', () => {
    it('gives each codec the table captured from the version it speaks', () => {
        expect(Codec2193.itemData).toBe(itemData2193);
        expect(Codec2225.itemData).toBe(itemData2225);
        expect(itemData2193.table).toBe(item_table);
        expect(itemData2225.table).toBe(item_table_2225);
    });

    it('resolves a table by protocol version, and 2193 for a version with no capture', () => {
        expect(itemDataForProtocol(2193)).toBe(itemData2193);
        expect(itemDataForProtocol(2225)).toBe(itemData2225);
        expect(itemDataForProtocol(2048)).toBe(itemData2193);
    });

    it('names the four items 1.26.60 added only at 2225', () => {
        for (const name of ADDED) {
            expect(itemData2225.table[name], name).toBeDefined();
            expect(itemData2193.table[name], name).toBeUndefined();
        }
    });

    it('keeps every 2193 name at 2225, since 1.26.60 removed none', () => {
        expect(Object.keys(itemData2193.table).filter((name) => !(name in itemData2225.table))).toEqual([]);
    });

    it('reads each version back the other way, so a stack is identified by its own numbering', () => {
        // 883 is the apple at 2225 and the blaze rod at 2193: the same number, two items.
        expect(itemData2225.nameOf(883)).toBe('minecraft:apple');
        expect(itemData2193.nameOf(882)).toBe('minecraft:apple');
        expect(itemData2193.nameOf(883)).not.toBe('minecraft:apple');
    });

    it('indexes every name in both directions', () => {
        for (const itemData of [itemData2193, itemData2225]) {
            for (const [name, entry] of Object.entries(itemData.table)) {
                expect(itemData.nameOf(entry.runtime_id), `${itemData.protocolVersion} ${name}`).toBeDefined();
            }
        }
    });

    it('shares the components, which are keyed by name and not by number', () => {
        expect(itemData2225.components).toBe(itemData2193.components);
    });

    it('starts a connection on the newest version, before one has been negotiated', () => {
        expect(HandshakeCodec.itemData).toBe(Codec2225.itemData);
    });
});
