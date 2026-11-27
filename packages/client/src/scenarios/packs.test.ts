// @module-tag integration

/**
 * What a joining player is told about the content a pack adds, played over a loopback pipe
 * against a server stepped by hand.
 *
 * The server loads one behavior pack that adds two blocks, one of them hidden from the creative
 * menu as a light block addon's are. A vanilla client closes on the loading screen when
 * `StartGame` declares a block the item registry has no item for, which is how an addon's blocks
 * kept players out. The pack also files a heading of its own in the creative menu through its
 * `item_catalog/crafting_item_catalog.json`, and adds a crafting recipe, a brewing mix and a
 * material reduction in Bedrock's own grammar.
 */
import CraftingDataPacket from '@jsprismarine/protocol/bedrock/packet/CraftingDataPacket';
import CreativeContentPacket from '@jsprismarine/protocol/bedrock/packet/CreativeContentPacket';
import ItemRegistryPacket from '@jsprismarine/protocol/bedrock/packet/ItemRegistryPacket';
import { nbtToPlain, readNetworkNbt } from '@jsprismarine/protocol/bedrock/payload';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CreativeContent } from '@jsprismarine/protocol/bedrock/packet/CreativeContentPacket';
import type { ItemRegistryEntry } from '@jsprismarine/protocol/bedrock/packet/ItemRegistryPacket';
import type { DecodedPacket } from '../net/ClientPacketRegistry';
import type { LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';

const MANIFEST = {
    format_version: 2,
    header: {
        name: 'Loopback pack blocks',
        description: 'Two blocks a pack adds',
        uuid: '0b5f2c1e-8a4d-4c7e-9f3b-2d6a1e8c4b70',
        version: [1, 0, 0],
        min_engine_version: [1, 21, 0]
    },
    modules: [{ type: 'data', uuid: '0b5f2c1e-8a4d-4c7e-9f3b-2d6a1e8c4b71', version: [1, 0, 0] }]
};

/** A block in the shape a light block addon writes: no collision, no selection, not in the creative menu. */
const LIGHT = {
    format_version: '1.21.80',
    'minecraft:block': {
        description: { identifier: 'loopback:light', menu_category: { category: 'none' } },
        components: {
            'minecraft:light_emission': 15,
            'minecraft:collision_box': false,
            'minecraft:selection_box': false
        }
    }
};

const STONE = {
    format_version: '1.21.80',
    'minecraft:block': {
        description: { identifier: 'loopback:stone', menu_category: { category: 'construction' } },
        components: { 'minecraft:destructible_by_mining': { seconds_to_destroy: 1 } }
    }
};

/** The catalog of issue #3823: a heading of the pack's own on the construction tab. */
const CATALOG = {
    format_version: '1.21.60',
    'minecraft:crafting_items_catalog': {
        categories: [
            {
                category_name: 'construction',
                groups: [
                    {
                        group_identifier: { icon: 'loopback:stone', name: 'loopback:itemGroup.name.example' },
                        items: ['loopback:stone', 'minecraft:dirt']
                    }
                ]
            }
        ]
    }
};

/** The recipe of issue #3835, which a server once built no part of its recipe book from. */
const RECIPE = {
    format_version: '1.20.10',
    'minecraft:recipe_shapeless': {
        description: { identifier: 'loopback:dirt_to_cobblestone' },
        tags: ['crafting_table'],
        ingredients: [{ item: 'minecraft:dirt' }],
        result: { item: 'minecraft:cobblestone' }
    }
};

/** A brewing mix and a material reduction, which issue #3838 found loading as nothing. */
const BREW = {
    format_version: '1.20.10',
    'minecraft:recipe_brewing_mix': {
        description: { identifier: 'loopback:awkward_from_dirt' },
        tags: ['brewing_stand'],
        input: 'minecraft:potion_type:water',
        reagent: 'minecraft:dirt',
        output: 'minecraft:potion_type:awkward'
    }
};

const REDUCTION = {
    format_version: '1.14',
    'minecraft:recipe_material_reduction': {
        description: { identifier: 'loopback:reduce_andesite_slab' },
        tags: 'material_reducer',
        input: 'minecraft:andesite_slab',
        output: [{ item: 'minecraft:cobblestone', count: 2 }]
    }
};

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({
        name: 'pack-scenarios',
        files: {
            'pack/manifest.json': JSON.stringify(MANIFEST),
            'pack/blocks/light.json': JSON.stringify(LIGHT),
            'pack/blocks/stone.json': JSON.stringify(STONE),
            'pack/item_catalog/crafting_item_catalog.json': JSON.stringify(CATALOG),
            'pack/recipes/dirt_to_cobblestone.json': JSON.stringify(RECIPE),
            'pack/recipes/awkward_from_dirt.json': JSON.stringify(BREW),
            'pack/recipes/reduce_andesite_slab.json': JSON.stringify(REDUCTION)
        },
        config: (stateRoot) => ({ 'content-world-packs': [path.join(stateRoot, 'pack')] })
    });
}, 1_200_000);

afterAll(async () => {
    await jsp?.close();
}, 60_000);

/** The `block_id` a `Block Properties` definition declares, from its `vanilla_block_data`. */
const blockIdOf = (definition: Buffer): number => {
    const plain = nbtToPlain(readNetworkNbt(definition));
    const data =
        typeof plain === 'object' && plain !== null && !Array.isArray(plain) ? plain.vanilla_block_data : undefined;
    const id = typeof data === 'object' && data !== null && !Array.isArray(data) ? data.block_id : undefined;
    return Number(String(id).replace(/^int:/, ''));
};

describe('pack blocks', () => {
    it("gives the client an item for each block the pack adds, numbered from the block's id", async () => {
        const { player, joined } = jsp.connect('Builder');
        const items: ItemRegistryEntry[] = [];
        // The registry arrives during the login, so the listener goes on before the join settles.
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof ItemRegistryPacket) items.push(...(packet.getPacketData()?.items ?? []));
        });
        let settled = false;
        const done = (): void => {
            settled = true;
        };
        void joined.then(done, done);
        await jsp.until(() => settled, 'Builder never joined', 400);
        await joined;

        const declared = (player.client.getStartGame()?.blockProperties ?? []).filter((block) =>
            block.name.startsWith('loopback:')
        );
        expect(declared.map((block) => block.name).sort()).toEqual(['loopback:light', 'loopback:stone']);

        // As a Bedrock Dedicated Server sends a pack's blocks: plain entries numbered 255 - block_id.
        for (const block of declared) {
            expect(items.find((item) => item.name === block.name)).toMatchObject({
                runtimeId: 255 - blockIdOf(block.definition),
                componentBased: false,
                version: 2
            });
        }
        player.leave();
        await jsp.tick();
    });

    it("lists the pack's block in the creative menu and leaves its hidden one out", async () => {
        const { player, joined } = jsp.connect('Creative');
        // The client decodes only what its login needs, so the menu is registered for this test.
        player.client.getRegistry().register(CreativeContentPacket);
        const items: ItemRegistryEntry[] = [];
        let menu: CreativeContent | undefined;
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof ItemRegistryPacket) items.push(...(packet.getPacketData()?.items ?? []));
            if (packet instanceof CreativeContentPacket) menu = packet.getPacketData() ?? undefined;
        });
        let settled = false;
        const done = (): void => {
            settled = true;
        };
        void joined.then(done, done);
        // The menu goes out before the join completes, and the join completes only on a tick.
        await jsp.until(() => settled, 'Creative never joined', 400);
        await joined;
        expect(menu).toBeDefined();

        const names = new Map(items.map((item) => [item.runtimeId, item.name]));
        const listed = (menu?.entries ?? []).map((entry) => names.get(entry.item.runtimeId));
        expect(listed).toContain('loopback:stone');
        expect(listed).not.toContain('loopback:light');
        player.leave();
        await jsp.tick();
    });
});

describe('pack item catalog', () => {
    it("files the pack's heading and its items in the creative menu", async () => {
        const { player, joined } = jsp.connect('Cataloger');
        const registry = player.client.getRegistry();
        if (!registry.has(new CreativeContentPacket().getId())) registry.register(CreativeContentPacket);
        const items: ItemRegistryEntry[] = [];
        const menus: CreativeContentPacket[] = [];
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof ItemRegistryPacket) items.push(...(packet.getPacketData()?.items ?? []));
            if (packet instanceof CreativeContentPacket) menus.push(packet);
        });
        let settled = false;
        const done = (): void => {
            settled = true;
        };
        void joined.then(done, done);
        await jsp.until(() => settled, 'Cataloger never joined', 400);
        await joined;

        const menu = menus.at(-1)?.getPacketData();
        const heading = menu?.groups.findIndex((group) => group.name === 'loopback:itemGroup.name.example') ?? -1;
        expect(heading).toBeGreaterThanOrEqual(0);
        const nameOf = (runtimeId: number) => items.find((item) => item.runtimeId === runtimeId)?.name;
        expect(
            menu?.entries.filter((entry) => entry.group === heading).map((entry) => nameOf(entry.item.runtimeId))
        ).toEqual(['loopback:stone', 'minecraft:dirt']);
        player.leave();
        await jsp.tick();
    });
});

describe('pack recipes', () => {
    it("sends the pack's recipes to a joining client", async () => {
        const { player, joined } = jsp.connect('Crafter');
        const registry = player.client.getRegistry();
        if (!registry.has(new CraftingDataPacket().getId())) registry.register(CraftingDataPacket);
        const items: ItemRegistryEntry[] = [];
        const lists: CraftingDataPacket[] = [];
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof ItemRegistryPacket) items.push(...(packet.getPacketData()?.items ?? []));
            if (packet instanceof CraftingDataPacket) lists.push(packet);
        });
        let settled = false;
        const done = (): void => {
            settled = true;
        };
        void joined.then(done, done);
        await jsp.until(() => settled, 'Crafter never joined', 400);
        await joined;
        await jsp.until(() => lists.length > 0, 'Crafter was never sent the recipe list');

        const recipe = lists
            .at(-1)
            ?.getPacketData()
            ?.shapeless.find((entry) => entry.id === 'loopback:dirt_to_cobblestone');
        expect(recipe?.station).toBe('crafting_table');
        const nameOf = (runtimeId: number) => items.find((item) => item.runtimeId === runtimeId)?.name;
        expect(recipe?.outputs.map((output) => nameOf(output.runtimeId))).toEqual(['minecraft:cobblestone']);
        expect(
            recipe?.ingredients.map(({ descriptor }) => (descriptor?.kind === 'name' ? descriptor.name : undefined))
        ).toEqual(['minecraft:dirt']);

        // A potion mix names its items by number, and a material reducer packs the input's
        // number into the high half of its key.
        const crafting = lists.at(-1)?.getPacketData();
        const idOf = (name: string) => items.find((item) => item.name === name)?.runtimeId;
        expect(crafting?.potionMixes).toContainEqual(
            expect.objectContaining({ inputId: idOf('minecraft:potion'), reagentId: idOf('minecraft:dirt') })
        );
        expect(crafting?.materialReducers).toContainEqual({
            fromItemKey: (idOf('minecraft:andesite_slab') ?? -1) << 16,
            outputs: [{ itemId: idOf('minecraft:cobblestone'), itemCount: 2 }]
        });
        player.leave();
        await jsp.tick();
    });
});
