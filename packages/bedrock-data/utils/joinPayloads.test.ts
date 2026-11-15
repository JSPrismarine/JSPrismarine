import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { creative_groups, creativeitems, entity_identifiers, item_components, item_table } from '../src/index.ts';
import { item_table as item_table_2225 } from '../src/v2225.ts';
import {
    assertActorIdentifiers,
    JOIN_PACKET_IDS,
    readCreativeContent,
    readItemRegistry,
    readWirePayload
} from './joinPayloads.ts';

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsp = join(packageDirectory, 'src/jsp');
const sources = JSON.parse(readFileSync(join(packageDirectory, 'sources.json'), 'utf8'));
const defaultCapture = join(jsp, `v${sources.bds.defaultProtocolVersion}`);

/** Every protocol version with a packet capture of its own. */
const capturedVersions = readdirSync(jsp).filter((name) => /^v\d+$/.test(name));

/** The `network_id` a published block state compound holds. */
const networkIdOf = (blockStates: string | undefined): number => {
    if (blockStates === undefined) return 0;
    const bytes = Buffer.from(blockStates, 'base64');
    return bytes.readInt32LE(bytes.indexOf('network_id') + 'network_id'.length);
};

describe('readItemRegistry', () => {
    it.each(capturedVersions)('agrees with the item list %s captured, name for name', (version) => {
        const directory = join(jsp, version);
        const registry = readItemRegistry(readWirePayload(directory, JOIN_PACKET_IDS.itemRegistry));
        const captured = JSON.parse(readFileSync(join(directory, 'required_item_list.json'), 'utf8'));

        expect(registry.map(({ name }) => name).sort()).toEqual(Object.keys(captured).sort());
        for (const { name, runtimeId, componentBased } of registry) {
            expect({ runtime_id: runtimeId, component_based: componentBased }).toEqual(captured[name]);
        }
    });

    it('gives every data driven item the components the client builds it from', () => {
        const registry = readItemRegistry(readWirePayload(defaultCapture, JOIN_PACKET_IDS.itemRegistry));
        const dataDriven = registry.filter(({ version }) => version === 1);

        expect(dataDriven).not.toHaveLength(0);
        for (const { name, componentData } of dataDriven) expect(componentData.byteLength, name).toBeGreaterThan(3);
    });

    it('refuses a payload with bytes after its last entry', () => {
        expect(() => readItemRegistry(Buffer.from([0, 0]))).toThrow(/1 bytes after its last field/);
    });
});

describe('readCreativeContent', () => {
    it.each(capturedVersions)('numbers the entries of %s from 1 and files each under a group', (version) => {
        const { groups, entries } = readCreativeContent(
            readWirePayload(join(jsp, version), JOIN_PACKET_IDS.creativeContent)
        );

        expect(entries.map(({ creativeNetId }) => creativeNetId)).toEqual(entries.map((_, index) => index + 1));
        for (const { group } of entries) expect(groups[group]).toBeDefined();
    });
});

describe('assertActorIdentifiers', () => {
    it('refuses a payload that is not one compound', () => {
        expect(() => assertActorIdentifiers(Buffer.from([8, 0]))).toThrow(/Expected an NBT compound/);
    });
});

/**
 * The generated tables against the capture they were generated from. Each holds a relationship
 * the server depends on, so a generator change that loses one fails here rather than on a
 * client.
 */
describe('the tables generated from the default capture', () => {
    const registry = readItemRegistry(readWirePayload(defaultCapture, JOIN_PACKET_IDS.itemRegistry));
    const names = new Map(registry.map(({ runtimeId, name }) => [runtimeId, name]));
    const nameOf = (runtimeId: number) => (runtimeId === 0 ? 'minecraft:air' : names.get(runtimeId));

    it('carry the version the registry sent with each item', () => {
        for (const { name, version } of registry) expect(item_table[name]?.version, name).toBe(version);
    });

    it('carry the component compounds byte for byte', () => {
        const sent = registry.filter(({ componentData }) => componentData.byteLength > 3);

        expect(Object.keys(item_components).sort()).toEqual(sent.map(({ name }) => name).sort());
        for (const { name, componentData } of sent)
            expect(item_components[name]?.equals(componentData), name).toBe(true);
    });

    it('replay the actor list the server sent', () => {
        expect(
            entity_identifiers.equals(readWirePayload(defaultCapture, JOIN_PACKET_IDS.availableActorIdentifiers))
        ).toBe(true);
    });

    it('list the creative menu in the order and with the blocks the server sent', () => {
        const { groups, entries } = readCreativeContent(
            readWirePayload(defaultCapture, JOIN_PACKET_IDS.creativeContent)
        );

        expect(creative_groups.map(({ name, icon }) => [name, icon])).toEqual(
            groups.map(({ name, icon }) => [name, nameOf(icon.runtimeId)])
        );
        expect(creative_groups.map(({ icon_block_states }) => networkIdOf(icon_block_states))).toEqual(
            groups.map(({ icon }) => icon.blockRuntimeId)
        );

        expect(creativeitems).toHaveLength(entries.length);
        for (const [index, { item, group }] of entries.entries()) {
            const published = creativeitems[index];
            expect(published?.name).toBe(nameOf(item.runtimeId));
            expect(published?.group).toBe(group);
            expect(published?.meta ?? 0).toBe(item.meta);
            expect(networkIdOf(published?.block_states)).toBe(item.blockRuntimeId);
            expect(published?.nbt).toBe(item.nbt?.toString('base64'));
        }
    });
});

describe('the tables generated from the other captures', () => {
    it('carry the version the 2225 registry sent with each item', () => {
        const registry = readItemRegistry(readWirePayload(join(jsp, 'v2225'), JOIN_PACKET_IDS.itemRegistry));
        for (const { name, version } of registry) expect(item_table_2225[name]?.version, name).toBe(version);
    });
});
