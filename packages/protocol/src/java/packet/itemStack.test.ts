import BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';
import { describe, expect, it } from 'vitest';

import type { WireType } from '../../wire/fieldTypes';
import { DATA_COMPONENT_TYPES } from '../versions/newest';
import type { JavaItemStack } from './itemStack';
import { itemStack, untrustedItemStack } from './itemStack';

const bytesOf = <T>(type: WireType<T>, value: T): Buffer => {
    const stream = new BinaryStream();
    type.write(stream, value);
    return stream.getBuffer();
};

const read = <T>(type: WireType<T>, bytes: readonly number[] | Buffer): T =>
    type.read(new BinaryStream(Buffer.from(bytes)));

const idOf = (component: string): number => DATA_COMPONENT_TYPES.idOf(component)!;

/** A stack that sets every component the codecs carry. */
const EVERY_COMPONENT: JavaItemStack = {
    item: 7,
    count: 1,
    components: {
        'minecraft:max_stack_size': 16,
        'minecraft:max_damage': 250,
        'minecraft:damage': 12,
        'minecraft:unbreakable': true,
        'minecraft:custom_name': 'Old Faithful',
        'minecraft:item_name': { translate: 'item.loopback.lamp' },
        'minecraft:item_model': 'loopback:lamp',
        'minecraft:lore': ['First line', { translate: 'lore.loopback', with: ['Steve'] }],
        'minecraft:enchantments': { 'minecraft:efficiency': 5, 'minecraft:unbreaking': 3 },
        'minecraft:stored_enchantments': { 'minecraft:mending': 1 },
        'minecraft:custom_model_data': { floats: [1.5], flags: [true, false], strings: ['lit'], colors: [0xff8800] },
        'minecraft:enchantment_glint_override': false,
        'minecraft:use_cooldown': { seconds: 2.5, group: 'loopback:lamps' },
        'minecraft:food': { nutrition: 4, saturation: 2.5, canAlwaysEat: true },
        'minecraft:consumable': {
            seconds: 1.5,
            animation: 'drink',
            sound: { id: 'minecraft:entity.generic.drink' },
            particles: true,
            effects: [
                {
                    type: 'minecraft:apply_effects',
                    effects: [
                        {
                            effect: 'minecraft:speed',
                            details: {
                                amplifier: 1,
                                duration: 600,
                                ambient: false,
                                showParticles: true,
                                showIcon: true,
                                hidden: {
                                    amplifier: 0,
                                    duration: 1200,
                                    ambient: true,
                                    showParticles: false,
                                    showIcon: true
                                }
                            }
                        }
                    ],
                    probability: 0.5
                },
                { type: 'minecraft:remove_effects', effects: { tag: 'minecraft:harmful' } },
                { type: 'minecraft:clear_all_effects' },
                { type: 'minecraft:teleport_randomly', diameter: 16, directionalParticles: true },
                { type: 'minecraft:play_sound', sound: { id: 'loopback:gulp', range: 8 } }
            ]
        },
        'minecraft:tool': {
            rules: [
                { blocks: { tag: 'minecraft:mineable/pickaxe' }, speed: 8, correctForDrops: true },
                { blocks: ['minecraft:cobweb', 'minecraft:stone'] }
            ],
            defaultMiningSpeed: 1,
            damagePerBlock: 1,
            canDestroyBlocksInCreative: false
        },
        'minecraft:equippable': {
            slot: 'head',
            equipSound: { id: 'minecraft:item.armor.equip_generic' },
            assetId: 'loopback:lamp',
            cameraOverlay: 'loopback:misc/lamp_overlay',
            allowedEntities: ['minecraft:player', 'minecraft:zombie'],
            dispensable: true,
            swappable: true,
            damageOnHurt: false,
            equipOnInteract: false,
            canBeSheared: false,
            shearingSound: { id: 'minecraft:item.shears.snip' }
        }
    },
    removed: ['minecraft:tool']
};

describe('Java item stacks', () => {
    it.each([
        ['the server', itemStack],
        ["a client's", untrustedItemStack]
    ])('reads back every component %s codec writes, and writes the same bytes again', (_, codec) => {
        const bytes = bytesOf(codec, EVERY_COMPONENT);
        const back = read(codec, bytes);
        expect(back).toEqual(EVERY_COMPONENT);
        expect(bytesOf(codec, back)).toEqual(bytes);
    });

    it('writes a set component as its type id and value, and a removed one as its id', () => {
        const stack: JavaItemStack = {
            item: 1,
            count: 2,
            components: { 'minecraft:damage': 5 },
            removed: ['minecraft:food']
        };
        expect([...bytesOf(itemStack, stack)]).toEqual([
            2,
            1,
            1,
            1,
            idOf('minecraft:damage'),
            5,
            idOf('minecraft:food')
        ]);
    });

    it('writes a plain stack with an empty patch, and an empty slot as a zero count', () => {
        expect([...bytesOf(itemStack, { item: 1, count: 64 })]).toEqual([64, 1, 0, 0]);
        expect([...bytesOf(itemStack, null)]).toEqual([0]);
        expect(read(itemStack, [64, 1, 0, 0])).toEqual({ item: 1, count: 64 });
    });

    it('refuses a component it has no codec for in what a server sent, which gives no length to skip it by', () => {
        // `minecraft:rarity`, an enum ordinal.
        expect(() => read(itemStack, [1, 1, 1, 0, idOf('minecraft:rarity'), 2])).toThrow(
            ProtocolWireErrors.JavaItemComponentUnread
        );
    });

    it('skips a component it has no codec for in what a client sent, by the length in front of it', () => {
        const bytes = [1, 1, 2, 0, idOf('minecraft:rarity'), 1, 2, idOf('minecraft:damage'), 1, 9];
        expect(read(untrustedItemStack, bytes)).toEqual({ item: 1, count: 1, components: { 'minecraft:damage': 9 } });
    });

    it('names a registered sound by its id plus one, and writes any other inline with its range', () => {
        const registered = bytesOf(itemStack, {
            item: 1,
            count: 1,
            components: {
                'minecraft:consumable': {
                    seconds: 1,
                    animation: 'eat',
                    sound: { id: 'minecraft:entity.generic.eat' },
                    particles: false,
                    effects: []
                }
            }
        });
        expect(registered.includes(Buffer.from('minecraft:entity.generic.eat'))).toBe(false);
        const inline = bytesOf(itemStack, {
            item: 1,
            count: 1,
            components: {
                'minecraft:consumable': {
                    seconds: 1,
                    animation: 'eat',
                    sound: { id: 'minecraft:entity.generic.eat', range: 4 },
                    particles: false,
                    effects: []
                }
            }
        });
        expect(inline.includes(Buffer.from('minecraft:entity.generic.eat'))).toBe(true);
    });

    it('refuses to write an enchantment the release lacks', () => {
        expect(() =>
            bytesOf(itemStack, { item: 1, count: 1, components: { 'minecraft:enchantments': { 'loopback:none': 1 } } })
        ).toThrow(ProtocolWireErrors.JavaRegistryEntryUnknown);
    });
});
