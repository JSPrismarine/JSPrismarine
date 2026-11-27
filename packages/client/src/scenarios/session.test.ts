// @module-tag integration

/**
 * What a joined player sees of the server's answers to chat, commands and the console: the
 * client e2e scenarios `chat`, `title`, `teleport`, `damage`, `command-syntax-error` and `kick`,
 * and the recipe book that `recipe-book` crafts from, played over a loopback pipe against a server
 * stepped by hand.
 */
import AvailableCommandsPacket from '@jsprismarine/protocol/bedrock/packet/AvailableCommandsPacket';
import CraftingDataPacket, { RecipeUnlockingContext } from '@jsprismarine/protocol/bedrock/packet/CraftingDataPacket';
import UnlockedRecipesPacket, {
    UnlockedRecipesType
} from '@jsprismarine/protocol/bedrock/packet/UnlockedRecipesPacket';
import { CommandDataFlags } from '@jsprismarine/protocol/bedrock/wire/structures/CommandData';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DecodedPacket } from '../net/ClientPacketRegistry';
import type { LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({ name: 'session-scenarios' });
}, 300_000);

afterAll(async () => {
    await jsp?.close();
}, 60_000);

describe('xbox-achievements', () => {
    it('joins a world with achievements on and cheats off, where every command may still be sent', async () => {
        const { player, joined } = jsp.connect('Achiever');
        const registry = player.client.getRegistry();
        if (!registry.has(new AvailableCommandsPacket().getId())) registry.register(AvailableCommandsPacket);
        const lists: AvailableCommandsPacket[] = [];
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof AvailableCommandsPacket) lists.push(packet);
        });
        let done = false;
        void joined.finally(() => {
            done = true;
        });
        await jsp.until(() => done, 'Achiever never joined', 120);
        await joined;
        await jsp.until(() => lists.length > 0, 'Achiever was never sent the command list');

        expect(player.client.getStartGame()).toMatchObject({ achievementsDisabled: false, commandsEnabled: false });
        // A client told cheats are off refuses a command without NOT_CHEAT before sending it.
        const commands = lists.at(-1)!.commandData;
        expect(commands.length).toBeGreaterThan(0);
        expect(commands.filter((command) => (command.flags & CommandDataFlags.NOT_CHEAT) === 0)).toEqual([]);
        player.leave();
        await jsp.tick();
    });
});

// The recipes come from the Java vanilla datapack, which only the real-data job has.
describe('furnace-inputs', { tags: ['real-data'] }, () => {
    /**
     * A Bedrock client picks the slot a shift-click puts a stack in by itself: a furnace's input
     * slot for something one of its cooking recipes takes, the fuel slot for fuel. The cooking
     * recipes come from `CraftingData`, as shapeless entries under the station's tag, and a
     * server that left them out made every shift-clicked ore miss the furnace.
     */
    it('tells a joining client what each furnace station cooks, and not that it cooks fuel', async () => {
        const { player, joined } = jsp.connect('Smelter');
        const registry = player.client.getRegistry();
        if (!registry.has(new CraftingDataPacket().getId())) registry.register(CraftingDataPacket);
        const lists: CraftingDataPacket[] = [];
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof CraftingDataPacket) lists.push(packet);
        });
        let done = false;
        void joined.finally(() => {
            done = true;
        });
        await jsp.until(() => done, 'Smelter never joined', 120);
        await joined;
        await jsp.until(() => lists.length > 0, 'Smelter was never sent the recipe list');

        const shapeless = lists.at(-1)?.getPacketData()?.shapeless ?? [];
        const cooks = (station: string, name: string): boolean =>
            shapeless.some(
                (recipe) =>
                    recipe.station === station &&
                    recipe.ingredients.some(({ descriptor }) => descriptor?.kind === 'name' && descriptor.name === name)
            );

        expect(cooks('furnace', 'minecraft:iron_ore')).toBe(true);
        expect(cooks('furnace', 'minecraft:raw_iron')).toBe(true);
        expect(cooks('blast_furnace', 'minecraft:raw_iron')).toBe(true);
        expect(cooks('smoker', 'minecraft:beef')).toBe(true);
        expect(cooks('blast_furnace', 'minecraft:beef')).toBe(false);
        expect(cooks('furnace', 'minecraft:coal')).toBe(false);
        player.leave();
        await jsp.tick();
    });
});

// The recipes and the advancement that unlocks one come from the Java vanilla datapack.
describe('recipe-book', { tags: ['real-data'] }, () => {
    it('starts a new player with an empty book and unlocks a recipe when its ingredient arrives', async () => {
        const { player, joined } = jsp.connect('Booker');
        const registry = player.client.getRegistry();
        for (const packet of [CraftingDataPacket, UnlockedRecipesPacket]) {
            if (!registry.has(new packet().getId())) registry.register(packet);
        }
        const recipes: CraftingDataPacket[] = [];
        const books: UnlockedRecipesPacket[] = [];
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof CraftingDataPacket) recipes.push(packet);
            if (packet instanceof UnlockedRecipesPacket) books.push(packet);
        });
        let done = false;
        void joined.finally(() => {
            done = true;
        });
        await jsp.until(() => done, 'Booker never joined', 120);
        await joined;
        await jsp.until(() => books.length > 0, 'Booker was never sent a recipe book');

        const crafting = recipes.at(-1)?.getPacketData();
        const planks = [...(crafting?.shaped ?? []), ...(crafting?.shapeless ?? [])].find(
            (recipe) => recipe.id === 'minecraft:oak_planks'
        );
        // Out of the book until the server says otherwise, so the craftable filter shows nothing.
        expect(planks?.unlocking).toEqual({ context: RecipeUnlockingContext.NONE, ingredients: [] });
        expect(books[0]?.getPacketData()).toEqual({
            type: UnlockedRecipesType.INITIALLY_UNLOCKED_RECIPES,
            recipes: []
        });

        // Holding a log completes `recipes/building_blocks/oak_planks`, which rewards the recipe.
        // Commands find the player once it is in the world, an input step after the join.
        await jsp.until(
            () => player.session()?.getConnection().hasSpawned() === true,
            'Booker never entered the world'
        );
        await jsp.command('give Booker minecraft:oak_log');
        await jsp.until(
            () => books.some((book) => book.getPacketData()?.recipes.includes('minecraft:oak_planks') === true),
            'the log never unlocked the oak planks'
        );
        expect(books.at(-1)?.getPacketData()?.type).toBe(UnlockedRecipesType.NEWLY_UNLOCKED_RECIPES);
        player.leave();
        await jsp.tick();
    });
});

describe('chat', () => {
    it("reaches another player as the sender's line", async () => {
        const sender = await jsp.join('Talker');
        const listener = await jsp.join('Listener');

        await sender.chat('hello from the loopback');
        await jsp.tick();

        const lines = listener.world.chat().map((text) => text.message);
        expect(lines.some((line) => line.includes('hello from the loopback'))).toBe(true);
        sender.leave();
        listener.leave();
        await jsp.tick();
    });
});

describe('title', () => {
    it('shows a title and subtitle the console sends', async () => {
        const player = await jsp.join('Titled');

        await jsp.command('title Titled times 0 100 0');
        await jsp.command('title Titled subtitle sub-marker');
        await jsp.command('title Titled title marker');

        expect(player.world.titles()).toMatchObject({ title: 'marker', subtitle: 'sub-marker' });
        player.leave();
        await jsp.tick();
    });
});

describe('teleport', () => {
    it('moves the player to the target of a console teleport', async () => {
        const player = await jsp.join('Teleported');
        await jsp.command('fill 23 -61 23 25 -61 25 minecraft:stone');

        await jsp.command('teleport Teleported 24 -60 24');
        await jsp.until(() => player.world.getTeleportCount() > 0, 'the client was never sent the teleport');
        await player.input();
        await jsp.tick();

        const position = player.world.getPosition();
        expect(position?.x).toBeCloseTo(24, 0);
        expect(position?.z).toBeCloseTo(24, 0);
        const server = player.session()?.getPlayer().getPosition();
        expect(server?.getX()).toBeCloseTo(24, 0);
        expect(server?.getZ()).toBeCloseTo(24, 0);
        player.leave();
        await jsp.tick();
    });
});

describe('damage', () => {
    it('lowers the health the client is sent', async () => {
        const player = await jsp.join('Hurt');
        await jsp.until(() => player.world.health() !== undefined, 'the client never learned its health');
        const before = player.world.health()!;

        await jsp.command('damage Hurt 6');
        await jsp.until(() => player.world.health()! <= before - 5, 'the client never took the damage');
        player.leave();
        await jsp.tick();
    });
});

describe('command-syntax-error', () => {
    it("answers a command line with a syntax error with the error Bedrock's server shows", async () => {
        const player = await jsp.join('Mistyped');
        await jsp.command('op Mistyped');
        await jsp.tick();

        await player.runCommand('/time set 1.5');
        await jsp.tick();

        // What Bedrock Dedicated Server 1.26.60.6 answers `/time set 1.5` with.
        const lines = player.world.chat().map((text) => text.message);
        expect(lines).toContain('§cSyntax error: Unexpected "1.5": at "/time set >>1.5<<"');
        player.leave();
        await jsp.tick();
    });
});

describe('kick', () => {
    it('tells the kicked client the reason the server gave', async () => {
        const player = await jsp.join('Kicked');

        await jsp.command('kick Kicked Kicked-for-the-loopback');
        await jsp.until(() => !player.client.isConnected(), 'the client was never disconnected');

        expect(player.world.getDisconnectReason()).toContain('Kicked-for-the-loopback');
        expect(player.client.isConnected()).toBe(false);
    });
});
