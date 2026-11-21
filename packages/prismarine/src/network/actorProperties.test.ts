import type { PropertyDefinition } from '@jsprismarine/entities';
import { NBTTagCompound } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { propertyOverridePacket, syncActorPropertyPacket } from './actorProperties';
import type { PropertyOverride } from './actorProperties';

/** A property store over plain definitions, in the order given. */
const storeOf = (...definitions: PropertyDefinition[]) => {
    const byName = new Map(definitions.map((definition) => [definition.name, definition]));
    return { names: () => [...byName.keys()], definition: (name: string) => byName.get(name) };
};

const pig = storeOf(
    {
        name: 'minecraft:climate_variant',
        type: 'enum',
        values: ['temperate', 'warm', 'cold'],
        default: { kind: 'literal', value: 'temperate' },
        clientSync: true
    },
    {
        name: 'minecraft:sound_variant',
        type: 'enum',
        values: ['default', 'big', 'mini'],
        default: { kind: 'literal', value: 'default' },
        clientSync: true
    }
);
const bee = storeOf({
    name: 'minecraft:has_nectar',
    type: 'bool',
    default: { kind: 'molang', source: "query.had_component_group('has_nectar')" },
    clientSync: true
});
const custom = storeOf(
    { name: 'jsp:hidden', type: 'int', default: { kind: 'literal', value: 0 }, clientSync: false },
    { name: 'jsp:count', type: 'int', range: [0, 6], default: { kind: 'literal', value: 0 }, clientSync: true },
    { name: 'jsp:scale', type: 'float', range: [0, 2], default: { kind: 'literal', value: 1 }, clientSync: true }
);

/** The creaking as `creaking.json` declares it: its swaying ticks before its state. */
const creaking = storeOf(
    {
        name: 'minecraft:creaking_swaying_ticks',
        type: 'int',
        range: [0, 6],
        default: { kind: 'literal', value: 0 },
        clientSync: true
    },
    {
        name: 'minecraft:creaking_state',
        type: 'enum',
        values: ['neutral', 'hostile_observed', 'hostile_unobserved', 'twitching', 'crumbling'],
        default: { kind: 'literal', value: 'neutral' },
        clientSync: true
    }
);

/** The pig's unique id in the BDS 1.26.60.6 capture the expected bytes come from. */
const PIG = -4294967288n;
const BEE = -4294967287n;

const hexOf = (target: bigint, store: ReturnType<typeof storeOf>, override: PropertyOverride): string | undefined => {
    const packet = propertyOverridePacket(target, store, override);
    if (packet === undefined) return undefined;
    packet.encode();
    return packet.getBuffer().toString('hex');
};

describe('propertyOverridePacket', () => {
    it('writes an enum override as BDS does, as the member index', () => {
        expect(hexOf(PIG, pig, { action: 'set', name: 'minecraft:climate_variant', value: 'cold' })).toBe(
            'c502efffffff1f00020e736574696e746f7665727269646502000000'
        );
    });

    it('writes a bool override as BDS does, as an int', () => {
        expect(hexOf(BEE, bee, { action: 'set', name: 'minecraft:has_nectar', value: true })).toBe(
            'c502edffffff1f00020e736574696e746f7665727269646501000000'
        );
    });

    it('writes a removal and a clear as BDS does', () => {
        expect(hexOf(PIG, pig, { action: 'remove', name: 'minecraft:climate_variant' })).toBe(
            'c502efffffff1f00010e72656d6f76656f76657272696465'
        );
        expect(hexOf(PIG, pig, { action: 'clear' })).toBe('c502efffffff1f00000e636c6561726f7665727269646573');
    });

    it('indexes a property among the client-synced ones only', () => {
        const packet = propertyOverridePacket(1n, custom, { action: 'set', name: 'jsp:scale', value: 1.5 });
        expect(packet?.getPacketData()).toEqual({ targetId: 1n, propertyIndex: 1, update: { type: 3, value: 1.5 } });
    });

    it('numbers the properties by name, as BDS does, not in the order the file declares them', () => {
        const indexOf = (name: string, value: number | string) =>
            propertyOverridePacket(1n, creaking, { action: 'set', name, value })?.getPacketData()?.propertyIndex;

        expect(indexOf('minecraft:creaking_state', 'twitching')).toBe(0);
        expect(indexOf('minecraft:creaking_swaying_ticks', 3)).toBe(1);
    });

    it('sends nothing for a property the client is not synced, or a value that does not fit', () => {
        expect(propertyOverridePacket(1n, custom, { action: 'set', name: 'jsp:hidden', value: 1 })).toBeUndefined();
        expect(propertyOverridePacket(1n, custom, { action: 'remove', name: 'jsp:missing' })).toBeUndefined();
        expect(
            propertyOverridePacket(1n, pig, { action: 'set', name: 'minecraft:climate_variant', value: 'hot' })
        ).toBeUndefined();
    });
});

describe('syncActorPropertyPacket', () => {
    it("lists a type's properties by name, the order every index refers to", () => {
        const definitions = new Map(creaking.names().map((name) => [name, creaking.definition(name)!] as const));
        const packet = syncActorPropertyPacket('minecraft:creaking', definitions);
        const listed = [...(packet?.propertyData.getList('properties', false) ?? [])].map((property) =>
            property instanceof NBTTagCompound ? property.getString('name', '') : undefined
        );

        expect(listed).toEqual(['minecraft:creaking_state', 'minecraft:creaking_swaying_ticks']);
    });
});
