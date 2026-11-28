import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JavaContentAssignments } from './JavaContentAssignments';
import { bedrockIconOf, javaCustomItemComponentsOf, JavaCustomItems } from './JavaCustomItems';

let scratch: string;
beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-java-custom-items-'));
});
afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
});

const assignment = { model: 'loopback:lamp', base: 'minecraft:paper' };

describe('javaCustomItemComponentsOf', () => {
    it("names the item's model and its Bedrock name key", () => {
        expect(javaCustomItemComponentsOf('loopback:lamp', new Map(), assignment)).toEqual({
            'minecraft:item_model': 'loopback:lamp',
            'minecraft:item_name': { translate: 'item.loopback:lamp.name' }
        });
        expect(
            javaCustomItemComponentsOf(
                'loopback:lamp',
                new Map([['minecraft:display_name', { value: 'item.loopback.lamp' }]]),
                assignment
            )['minecraft:item_name']
        ).toEqual({ translate: 'item.loopback.lamp' });
    });

    it('wears out a durable item, which then stacks to one, as no Java stack both wears and stacks', () => {
        expect(
            javaCustomItemComponentsOf(
                'loopback:pick',
                new Map<string, unknown>([
                    ['minecraft:max_stack_size', 16],
                    ['minecraft:durability', { max_durability: 250 }]
                ]),
                assignment
            )
        ).toMatchObject({ 'minecraft:max_stack_size': 1, 'minecraft:max_damage': 250 });
        expect(
            javaCustomItemComponentsOf(
                'loopback:gem',
                new Map([['minecraft:max_stack_size', { value: 16 }]]),
                assignment
            )
        ).toMatchObject({ 'minecraft:max_stack_size': 16 });
    });

    it('lets a player eat food in its use time, wear what is wearable and wait out a cooldown', () => {
        expect(
            javaCustomItemComponentsOf(
                'loopback:berry',
                new Map<string, unknown>([
                    ['minecraft:food', { nutrition: 4, saturation_modifier: 0.5 }],
                    ['minecraft:use_modifiers', { use_duration: 0.8 }],
                    ['minecraft:cooldown', { category: 'berries', duration: 2 }],
                    ['minecraft:wearable', { slot: 'slot.armor.head' }]
                ]),
                assignment
            )
        ).toMatchObject({
            'minecraft:food': { nutrition: 4, saturation: 4, canAlwaysEat: false },
            'minecraft:consumable': { seconds: 0.8, animation: 'eat' },
            'minecraft:use_cooldown': { seconds: 2, group: 'loopback:berries' },
            'minecraft:equippable': { slot: 'head' }
        });
    });
});

describe('bedrockIconOf', () => {
    it.each([
        ['a name', 'lamp'],
        ['a texture', { texture: 'lamp' }],
        ['a default texture', { textures: { default: 'lamp' } }],
        ['a textures name', { textures: 'lamp' }]
    ])('reads %s', (_, icon) => {
        expect(bedrockIconOf(icon)).toBe('lamp');
    });
});

describe('JavaCustomItems', () => {
    it('assigns the items Java has none for, and draws the ones with an icon', async () => {
        const file = path.join(scratch, 'java-content.json');
        const items = new JavaCustomItems(new JavaContentAssignments(file, { info: () => {} }), (identifier) =>
            identifier.startsWith('minecraft:')
        );
        await items.load();
        await items.update([
            { identifier: 'minecraft:stone', bedrockComponents: new Map() },
            { identifier: 'loopback:lamp', bedrockComponents: new Map([['minecraft:icon', 'lamp']]) },
            { identifier: 'loopback:bow', bedrockComponents: new Map([['minecraft:shooter', {}]]) }
        ]);

        expect(items.stackOf('minecraft:stone')).toBeUndefined();
        expect(items.stackOf('loopback:lamp')).toMatchObject({
            base: 'minecraft:paper',
            components: { 'minecraft:item_model': 'loopback:lamp' }
        });
        expect(items.stackOf('loopback:bow')?.base).toBe('minecraft:bow');
        expect(items.models()).toEqual([{ model: 'loopback:lamp', icon: 'lamp' }]);
        expect(items.identifierOf('loopback:lamp')).toBe('loopback:lamp');
        expect(items.identifierOf('minecraft:stone')).toBeUndefined();
        expect(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).items)).toEqual(['loopback:lamp', 'loopback:bow']);
    });
});
