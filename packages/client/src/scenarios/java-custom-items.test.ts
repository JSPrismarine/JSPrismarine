// @module-tag integration

/**
 * A Java Edition client and an addon's custom item: the server sends the item as a vanilla base
 * item that names a model of the item's own, and the converted resource pack draws that model
 * from the item's Bedrock icon.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { JavaItemStack } from '@jsprismarine/protocol/java/packet/itemStack';
import { ContainerSetContent, ContainerSetSlot, SetCreativeModeSlot } from '@jsprismarine/protocol/java/packet/play';
import { ITEMS } from '@jsprismarine/protocol/java/versions/newest';
import { readZip, writeZip } from '@jsprismarine/packs/zip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';

const encoder = new TextEncoder();
const json = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));

/** A one-pixel opaque TGA, stored top row first. */
const tga = (): Uint8Array => {
    const bytes = new Uint8Array(18 + 4);
    bytes[2] = 2;
    bytes[12] = 1;
    bytes[14] = 1;
    bytes[16] = 32;
    bytes[17] = 8 | 0x20;
    bytes.set([0, 128, 255, 255], 18);
    return bytes;
};

/** A pack of one module, as an addon's `.mcpack` holds it. */
const mcpack = (type: 'data' | 'resources', uuid: string, files: Record<string, Uint8Array>): Uint8Array =>
    writeZip(
        new Map([
            [
                'manifest.json',
                json({
                    format_version: 2,
                    header: { name: `Loopback ${type}`, uuid, version: [1, 0, 0], min_engine_version: [1, 21, 0] },
                    modules: [{ type, uuid: `${uuid.slice(0, -2)}ff`, version: [1, 0, 0] }]
                })
            ],
            ...Object.entries(files)
        ])
    );

describe("a Java Edition client and an addon's custom item", () => {
    let loopback: LoopbackServer;

    beforeAll(async () => {
        loopback = await startLoopbackServer({
            name: 'java-custom-items',
            config: { 'java-enabled': true, 'java-port': 0 },
            files: {
                'addons/loopback-lamp-behavior.mcpack': mcpack('data', '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c40', {
                    'items/lamp.json': json({
                        format_version: '1.21.0',
                        'minecraft:item': {
                            description: { identifier: 'loopback:lamp', menu_category: { category: 'items' } },
                            components: { 'minecraft:icon': 'lamp', 'minecraft:max_stack_size': 16 }
                        }
                    })
                }),
                'addons/loopback-lamp-resources.mcpack': mcpack('resources', '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c41', {
                    'textures/items/lamp.tga': tga(),
                    'textures/item_texture.json': json({
                        resource_pack_name: 'loopback',
                        texture_data: { lamp: { textures: 'textures/items/lamp' } }
                    }),
                    'texts/en_US.lang': encoder.encode('item.loopback:lamp.name=Loopback Lamp')
                })
            }
        });
    }, 120_000);

    afterAll(async () => {
        await loopback?.close();
    });

    it('is sent the item as paper naming its model and its name, which the converted pack draws', async () => {
        const java = await loopback.joinJava('Alex');
        const isLamp = (item: JavaItemStack | null | undefined) =>
            item?.components?.['minecraft:item_model'] === 'loopback:lamp';
        let shown: JavaItemStack | null | undefined;
        void Promise.race([
            java.next(ContainerSetSlot, ({ item }) => isLamp(item)).then(({ item }) => item),
            java.next(ContainerSetContent, ({ items }) => items.some(isLamp)).then(({ items }) => items.find(isLamp))
        ]).then((item) => {
            shown = item;
        });
        expect((await loopback.command('give Alex loopback:lamp 3')).ran).toBe(true);
        await loopback.untilJava(() => shown !== undefined, "Alex's client was never shown the lamp");

        expect(shown).toEqual({
            item: ITEMS.idOf('minecraft:paper'),
            count: 3,
            components: {
                'minecraft:item_model': 'loopback:lamp',
                'minecraft:item_name': { translate: 'item.loopback:lamp.name' },
                'minecraft:max_stack_size': 16
            }
        });

        const [pack] = java.getResourcePacks().values();
        const files = readZip(pack!.bytes);
        const text = (file: string): unknown => JSON.parse(new TextDecoder().decode(files.get(file)));
        expect(text('assets/loopback/items/lamp.json')).toEqual({
            model: { type: 'minecraft:model', model: 'loopback:item/lamp' }
        });
        expect(text('assets/loopback/models/item/lamp.json')).toEqual({
            parent: 'minecraft:item/generated',
            textures: { layer0: 'bedrock:items/lamp' }
        });
        expect(files.has('assets/bedrock/textures/items/lamp.png')).toBe(true);
        expect(text('assets/bedrock/lang/en_us.json')).toMatchObject({ 'item.loopback:lamp.name': 'Loopback Lamp' });
    });

    it('puts a lamp it took in creative back in its inventory as the custom item', async () => {
        const java = await loopback.joinJava('Sam');
        const sam = loopback.server
            .getSessionManager()
            .getSessions()
            .find((session) => session.getPlayer().getName() === 'Sam');
        if (sam === undefined) throw new Error('Sam should be on');
        expect((await loopback.command('gamemode creative Sam')).ran).toBe(true);
        const slot = () => sam.getInventory().container('inventory').get(2);

        // Window slot 38 is hotbar slot 2; the stack is the lamp as the server sent it, renamed.
        java.send(SetCreativeModeSlot, {
            slot: 38,
            item: {
                item: ITEMS.idOf('minecraft:paper')!,
                count: 2,
                components: {
                    'minecraft:item_model': 'loopback:lamp',
                    'minecraft:item_name': { translate: 'item.loopback:lamp.name' },
                    'minecraft:max_stack_size': 16,
                    'minecraft:custom_name': 'Desk Lamp'
                }
            }
        });
        await loopback.untilJava(() => slot() !== null, 'the server never put the lamp in the slot');

        const lamp = slot()!;
        expect(lamp.getName()).toBe('loopback:lamp');
        expect(lamp.getAmount()).toBe(2);
        expect(lamp.getCustomName()).toBe('Desk Lamp');
        expect(lamp.getComponents()).toEqual({});
    });

    it('keeps the assignment in java-content.json, beside the config', () => {
        const written = JSON.parse(readFileSync(path.join(loopback.stateRoot, 'java-content.json'), 'utf8'));
        expect(written.items['loopback:lamp']).toEqual({ model: 'loopback:lamp', base: 'minecraft:paper' });
    });
});
