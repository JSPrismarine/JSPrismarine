// @module-tag integration

/**
 * A Java Edition client on the server: `@jsprismarine/client`'s `JavaClient` joins a stepped
 * flat-world server over TCP, beside a Bedrock client on a loopback pipe, and each sees what the
 * other does.
 */
import {
    AddEntity,
    Attack,
    ContainerSetContent,
    ContainerSetSlot,
    JavaEntityDataSerializer,
    SetCarriedItem,
    SetCreativeModeSlot,
    SetCenterChunk,
    SetEntityData
} from '@jsprismarine/protocol/java/packet/play';
import type { JavaItemStack } from '@jsprismarine/protocol/java/packet/itemStack';
import { ITEMS } from '@jsprismarine/protocol/java/versions/newest';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JavaClient } from '../java/JavaClient';
import type { LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';
import { shownText } from './scenarioSupport.test-utils';

/** A text component's words, with every translation argument, as one string to search. */
const wordsOf = (text: JavaText): string =>
    typeof text === 'string' ? text : [text.translate, ...(text.with ?? []).map(wordsOf)].join(' ');

describe('a Java Edition client', () => {
    let loopback: LoopbackServer;
    let java: JavaClient;
    const chat: string[] = [];
    /** The entity ids the client was shown, which it names an entity by. */
    const shownEntities: number[] = [];

    beforeAll(async () => {
        loopback = await startLoopbackServer({
            name: 'java-client',
            config: { 'java-enabled': true, 'java-port': 0 }
        });
        java = await loopback.joinJava('Alex', { language: 'sv_se' });
        java.on('chat', (content) => chat.push(wordsOf(content)));
        // Every entity the client is shown, one `Spawn Entity` after another until it hangs up.
        const watch = (): void =>
            void java.next(AddEntity).then(
                ({ entityId }) => {
                    shownEntities.push(entityId);
                    watch();
                },
                () => {}
            );
        watch();
    }, 120_000);

    afterAll(async () => {
        await loopback?.close();
    });

    it('joins in play, placed in the world, with the chunks around it', () => {
        const pose = java.getPose();

        expect(java.getPhase()).toBe('play');
        expect(pose).toBeDefined();
        expect(java.getLogin()?.dimension).toBe('minecraft:overworld');
        expect(java.hasChunk(Math.floor(pose!.x / 16), Math.floor(pose!.z / 16))).toBe(true);
    });

    it("plays in the language its settings name, which scripts read as the player's locale", () => {
        const alex = loopback.server
            .getSessionManager()
            .getSessions()
            .find((entry) => entry.getName() === 'Alex');

        expect(alex?.getPlayer().locale).toBe('sv_SE');
    });

    it('moves its player on the server', async () => {
        const from = java.getPose()!;
        const session = () =>
            loopback.server
                .getSessionManager()
                .getSessions()
                .find((entry) => entry.getName() === 'Alex');

        java.move({ x: from.x + 2, z: from.z + 1 });
        await loopback.untilJava(
            () => Math.abs((session()?.getPlayer().getPosition().getX() ?? Number.NaN) - (from.x + 2)) < 0.01,
            "Alex's move never reached the server"
        );

        expect(session()?.getPlayer().getPosition().getZ()).toBeCloseTo(from.z + 1);
    });

    it('chats with a Bedrock player, both ways', async () => {
        const steve = await loopback.join('Steve');

        java.chat('hello from Java');
        await loopback.untilJava(
            () => shownText(steve).some((line) => line.includes('hello from Java')),
            'Steve never saw what Alex said'
        );

        await steve.chat('hello from Bedrock');
        await loopback.untilJava(
            () => chat.some((line) => line.includes('hello from Bedrock')),
            'Alex never saw what Steve said'
        );
    });

    it('is sent the chunks ahead of its player as it walks, after answering each batch', async () => {
        const pose = java.getPose()!;
        const ahead = { x: Math.floor(pose.x / 16) + 4, z: Math.floor(pose.z / 16) };
        let center: { readonly x: number; readonly z: number } | undefined;
        void java.next(SetCenterChunk).then((moved) => {
            center = moved;
        });

        // Two chunks over: the view moves its center, and the server sends the column four ahead.
        java.move({ x: pose.x + 32 });
        await loopback.untilJava(() => java.hasChunk(ahead.x, ahead.z), 'the chunk ahead never came');

        expect(center).toEqual({ x: Math.floor((pose.x + 32) / 16), z: ahead.z });
    });

    it('drops one item of the stack in its hand, and sees its slot and the dropped stack change', async () => {
        // The hand holds hotbar slot 0, which is window slot 36, as it has since the join. A
        // slot shows its count through either a one-slot update or the whole window.
        const HAND = 36;
        const shows = (count: number) =>
            Promise.race([
                java.next(
                    ContainerSetSlot,
                    ({ window, slot, item }) => window === 0 && slot === HAND && (item?.count ?? 0) === count
                ),
                java.next(
                    ContainerSetContent,
                    ({ window, items }) => window === 0 && (items[HAND]?.count ?? 0) === count
                )
            ]);
        const shownStack = java.next(SetEntityData, ({ entries }) =>
            entries.some(({ serializer }) => serializer === JavaEntityDataSerializer.ItemStack)
        );

        let given = false;
        void shows(5).then(() => {
            given = true;
        });
        expect((await loopback.command('give Alex stone 5')).ran).toBe(true);
        await loopback.untilJava(() => given, "Alex's client was never shown the stone");

        let dropped = false;
        void shows(4).then(() => {
            dropped = true;
        });
        java.dropHeldItem();
        await loopback.untilJava(() => dropped, "Alex's client still shows the whole stack");

        const { entries } = await shownStack;
        expect(
            entries.find(({ serializer }) => serializer === JavaEntityDataSerializer.ItemStack)?.value
        ).toMatchObject({ count: 1 });
    });

    it('is shown the name, lore, damage and enchantments of the stack in its hand', async () => {
        const alex = loopback.server
            .getSessionManager()
            .getSessions()
            .find((session) => session.getPlayer().getName() === 'Alex');
        if (alex === undefined) throw new Error('Alex should be on');
        const inventory = alex.getInventory();
        expect((await loopback.command('give Alex diamond_pickaxe')).ran).toBe(true);
        const slot = inventory
            .container('inventory')
            .items()
            .findIndex((item) => item?.getName() === 'minecraft:diamond_pickaxe');
        java.send(SetCarriedItem, { slot });
        await loopback.untilJava(() => inventory.getHandSlot() === slot, 'Alex never took the pickaxe in hand');

        // A worn, renamed pickaxe, which the server holds; the enchanting then shows the slot.
        const pickaxe = inventory.container('inventory').get(slot)!;
        inventory
            .container('inventory')
            .set(
                slot,
                pickaxe
                    .withDisplay('Old Faithful', ['Dug the first mine'])
                    .withDurability(pickaxe.getMaxDurability() - 120)
            );
        const isEnchanted = (item: JavaItemStack | null | undefined) =>
            item?.components?.['minecraft:enchantments'] !== undefined;
        let shown: JavaItemStack | null | undefined;
        void Promise.race([
            java.next(ContainerSetSlot, ({ item }) => isEnchanted(item)).then(({ item }) => item),
            java
                .next(ContainerSetContent, ({ items }) => items.some(isEnchanted))
                .then(({ items }) => items.find(isEnchanted))
        ]).then((item) => {
            shown = item;
        });
        expect((await loopback.command('enchant Alex efficiency 3')).ran).toBe(true);
        await loopback.untilJava(() => shown !== undefined, "Alex's client was never shown the enchanted pickaxe");

        expect(shown).toMatchObject({
            components: {
                'minecraft:custom_name': 'Old Faithful',
                'minecraft:lore': ['Dug the first mine'],
                'minecraft:damage': 120,
                'minecraft:enchantments': { 'minecraft:efficiency': 3 }
            }
        });
    });

    it('puts a stack it took in creative in its inventory, keeping its name, damage and enchantments', async () => {
        const alex = loopback.server
            .getSessionManager()
            .getSessions()
            .find((session) => session.getPlayer().getName() === 'Alex');
        if (alex === undefined) throw new Error('Alex should be on');
        expect((await loopback.command('gamemode creative Alex')).ran).toBe(true);
        // Window slot 43 is hotbar slot 7.
        const slot = () => alex.getInventory().container('inventory').get(7);

        java.send(SetCreativeModeSlot, {
            slot: 43,
            item: {
                item: ITEMS.idOf('minecraft:diamond_pickaxe')!,
                count: 1,
                components: {
                    'minecraft:custom_name': 'Spare',
                    'minecraft:damage': 30,
                    'minecraft:enchantments': { 'minecraft:fortune': 2 }
                }
            }
        });
        await loopback.untilJava(() => slot() !== null, 'the server never put the pickaxe in the slot');

        const pickaxe = slot()!;
        expect(pickaxe.getName()).toBe('minecraft:diamond_pickaxe');
        expect(pickaxe.getCustomName()).toBe('Spare');
        expect(pickaxe.getMaxDurability() - pickaxe.getDurability()).toBe(30);
        expect(pickaxe.getEnchantmentLevel('minecraft:fortune')).toBe(2);
        expect((await loopback.command('gamemode survival Alex')).ran).toBe(true);
    });

    it('hits a Bedrock player, who takes the blow', async () => {
        const sessions = () => loopback.server.getSessionManager().getSessions();
        const named = (name: string) => sessions().find((entry) => entry.getName() === name);
        // Steve joined to chat; he comes to stand where Alex is, within reach of the blow.
        expect((await loopback.command('tp Steve Alex')).ran).toBe(true);
        const steve = named('Steve');
        const alex = named('Alex');
        if (steve === undefined || alex === undefined) throw new Error('both players should be on');
        await loopback.untilJava(
            () => steve.getPlayer().getPosition().distanceTo(alex.getPlayer().getPosition()) < 1,
            'Steve never came to Alex'
        );
        // A Java client names the entity it hits by the id its `Spawn Entity` carried, so Alex
        // has to have been shown Steve under the id the hit names.
        const steveId = Number(steve.runtimeId);
        await loopback.untilJava(() => shownEntities.includes(steveId), 'Alex was never shown Steve');
        const before = steve.getPlayer().getHealth();

        java.send(Attack, { entityId: steveId });
        await loopback.untilJava(() => steve.getPlayer().getHealth() < before, "Alex's blow never landed on Steve");
    });

    it('plays beside a Bedrock player of the same name, neither replacing the other', async () => {
        const named = () =>
            loopback.server
                .getSessionManager()
                .getSessions()
                .filter((entry) => entry.getName() === 'Alex');
        let disconnected = false;
        const hungUp = (): void => {
            disconnected = true;
        };
        java.once('disconnect', hungUp);
        java.once('close', hungUp);

        const bedrockAlex = await loopback.join('Alex');
        await loopback.tick(5);

        expect(disconnected).toBe(false);
        expect(java.getPhase()).toBe('play');
        expect(bedrockAlex.session()?.isConnected()).toBe(true);
        expect(named()).toHaveLength(2);
        java.off('disconnect', hungUp);
        java.off('close', hungUp);
        bedrockAlex.leave();
    });
});
