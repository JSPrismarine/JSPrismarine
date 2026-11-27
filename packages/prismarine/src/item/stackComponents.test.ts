/**
 * A stack's other Java components: kept on the stack, written to a record and read back, sent to
 * the client as the Bedrock tags that draw them, and counted when two stacks decide to merge.
 */
import { NBTTagCompound } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { itemStackFromNbt, itemStackToNbt } from '../inventory/itemNbt';
import { restoredItem, storedItem } from '../inventory/persistence';
import { ItemContainer } from '../inventory/ItemContainer';
import { addComponentTags } from './componentTags';
import { dyeFireworkRgb } from './dyeColors';
import { Item } from './Item';
import { dropOfRolledStack, rolledStackOfDrop } from './lootStack';
import { sameStackComponents, stackComponentsOf } from './stackComponents';

const COAST_REDSTONE = { material: 'minecraft:redstone', pattern: 'minecraft:coast' };

/** Every tag `addComponentTags` writes for a bag, in a fresh compound. */
const tagsOf = (components: Record<string, unknown>): NBTTagCompound => {
    const tag = new NBTTagCompound('tag');
    addComponentTags(tag, components);
    return tag;
};

describe('a stack with other Java components', () => {
    it('keeps them through a copy, a count change and a durability change', () => {
        const trimmed = new Item({ name: 'minecraft:iron_chestplate' }).withComponents({
            'minecraft:trim': COAST_REDSTONE
        });

        expect(trimmed.withCount(2).withDurability(10).getComponents()).toEqual({ 'minecraft:trim': COAST_REDSTONE });
    });

    it('removes a component set to undefined and leaves one held in a field of its own', () => {
        const stack = new Item({ name: 'minecraft:iron_chestplate' })
            .withComponents({ 'minecraft:trim': COAST_REDSTONE, 'minecraft:enchantments': { levels: { a: 1 } } })
            .withComponents({ 'minecraft:trim': undefined });

        expect(stack.getComponents()).toEqual({});
        expect(stack.getEnchantments().size).toBe(0);
    });

    it('shows them to the recipe and loot grammars, with the color a dye item is', () => {
        const chestplate = new Item({ name: 'minecraft:iron_chestplate' }).withComponents({
            'minecraft:trim': COAST_REDSTONE
        });

        expect(chestplate.asPredicateStack().components.get('minecraft:trim')).toEqual(COAST_REDSTONE);
        expect(new Item({ name: 'minecraft:red_dye' }).asPredicateStack().components.get('minecraft:dye')).toBe('red');
    });

    it('survives a player record and a Bedrock item compound', () => {
        const star = new Item({ name: 'minecraft:firework_star' }).withComponents({
            'minecraft:firework_explosion': { shape: 'star', colors: [0xb3312c], has_trail: true }
        });

        const stored = storedItem(star);
        if (stored === null) throw new Error('the star was stored as nothing');
        const reread = itemStackFromNbt(itemStackToNbt(stored));

        expect(reread?.components).toEqual(star.getComponents());
        expect(restoredItem(reread)?.getComponents()).toEqual(star.getComponents());
    });

    it('survives a loot drop in both directions', () => {
        const drop = dropOfRolledStack({
            id: 'minecraft:leather_helmet',
            count: 1,
            components: new Map<string, unknown>([
                ['minecraft:dyed_color', 0x3c44aa],
                ['minecraft:custom_name', 'Cap']
            ])
        });

        expect(drop.components).toEqual({ 'minecraft:dyed_color': 0x3c44aa });
        expect(drop.customName).toBe('Cap');
        expect(rolledStackOfDrop(drop).components.get('minecraft:dyed_color')).toBe(0x3c44aa);
    });

    it('does not merge into a plain stack, whatever order its components were set in', () => {
        const explosion = { shape: 'burst', colors: [1] };
        const first = new Item({ name: 'minecraft:firework_rocket' }).withComponents({
            'minecraft:fireworks': { flight_duration: 1, explosions: [explosion] }
        });
        const container = new ItemContainer(2);
        container.set(0, first);

        expect(container.add(new Item({ name: 'minecraft:firework_rocket' }))).toBe(0);
        expect(container.get(1)?.getComponents()).toEqual({});
        expect(
            sameStackComponents(
                { a: { x: 1, y: 2 }, b: 1 },
                stackComponentsOf([
                    ['b', 1],
                    ['a', { y: 2, x: 1 }]
                ])
            )
        ).toBe(true);
    });
});

describe('the Bedrock tags for other components', () => {
    it('writes an armor trim as Trim with the pattern and material names', () => {
        const trim = tagsOf({ 'minecraft:trim': COAST_REDSTONE }).getCompound('Trim', false);

        expect(trim?.getString('Material', '')).toBe('redstone');
        expect(trim?.getString('Pattern', '')).toBe('coast');
    });

    it('writes a dyed color as an opaque customColor', () => {
        expect(tagsOf({ 'minecraft:dyed_color': 0x3c44aa }).getNumber('customColor', 0)).toBe(0xff3c44aa | 0);
    });

    it("writes a firework star's explosion by Bedrock dye number, tinted with its color", () => {
        const red = dyeFireworkRgb('red') ?? -1;
        const tag = tagsOf({
            'minecraft:firework_explosion': {
                shape: 'creeper',
                colors: [red],
                fade_colors: [0x253192],
                has_twinkle: true
            }
        });
        const star = tag.getCompound('FireworksItem', false);

        expect(star?.getByte('FireworkType', -1)).toBe(3);
        // Bedrock numbers the dyes from black, so Java's red, the fifteenth, is 1.
        expect([...(star?.children.get('FireworkColor') ?? [])]).toEqual([1]);
        expect([...(star?.children.get('FireworkFade') ?? [])]).toEqual([4]);
        expect(star?.getByte('FireworkFlicker', 0)).toBe(1);
        expect(star?.getByte('FireworkTrail', 1)).toBe(0);
        expect(tag.getNumber('customColor', 0)).toBe(0xff000000 | red | 0);
    });

    it("writes a rocket's flight and explosions", () => {
        const rocket = tagsOf({
            'minecraft:fireworks': { flight_duration: 3, explosions: [{ shape: 'large_ball', colors: [] }] }
        }).getCompound('Fireworks', false);

        expect(rocket?.getByte('Flight', 0)).toBe(3);
        expect([...(rocket?.getList('Explosions', false) ?? [])]).toHaveLength(1);
    });

    it("writes a banner's patterns by Bedrock code and a shield's base color", () => {
        const tag = tagsOf({
            'minecraft:banner_patterns': [{ pattern: 'minecraft:stripe_bottom', color: 'black' }],
            'minecraft:base_color': 'white'
        });
        const [layer] = [...(tag.getList('Patterns', false) ?? [])];

        expect(layer?.getString('Pattern', '')).toBe('bs');
        expect(layer?.getNumber('Color', -1)).toBe(0);
        expect(tag.getNumber('Base', -1)).toBe(15);
    });

    it("writes a written book's pages, title, author and generation", () => {
        const tag = tagsOf({
            'minecraft:written_book_content': {
                title: { raw: 'Notes' },
                author: 'Steve',
                generation: 1,
                pages: [{ raw: 'one' }, 'two']
            }
        });

        expect([...(tag.getList('pages', false) ?? [])].map((page) => page.getString('text', ''))).toEqual([
            'one',
            'two'
        ]);
        expect(tag.getString('title', '')).toBe('Notes');
        expect(tag.getString('author', '')).toBe('Steve');
        expect(tag.getNumber('generation', -1)).toBe(1);
    });

    it('goes to the client in the stack user data', () => {
        const tag = new Item({ name: 'minecraft:iron_chestplate' })
            .withComponents({ 'minecraft:trim': COAST_REDSTONE })
            .userDataTag();

        expect(tag?.getCompound('Trim', false)?.getString('Pattern', '')).toBe('coast');
    });
});
