/**
 * Which creative menu and which recipe list a player is sent.
 *
 * Each has two sources, the content build and the server's own tables, and
 * the creative one also has a reader: the client answers a pick with the
 * entry's position, so the menu that goes out and the list
 * `ItemStackRequestHandler` reads a pick against have to be the same one.
 * These tests pin which source each path takes.
 */
import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type Server from '../Server';
import type { Config } from '../config/Config';
import { buildServerContent } from '../content/ServerContent';
import { fixtureBlockPalette, fixtureContentOptions } from '../content/testing';
import type RecipeManager from '../crafting/RecipeManager';
import CreativeInventory from '../inventory/CreativeInventory';
import { stub } from '../testing/stub.test.helper';
import PlayerSession from './PlayerSession';
import type ClientConnection from './ClientConnection';
import { joinContentPayloads, limitCraftingData } from './contentPayloads';
import CraftingDataPacket from './packet/CraftingDataPacket';
import CreativeContentPacket from './packet/CreativeContentPacket';
import type DataPacket from './packet/DataPacket';

import type { CraftingData } from '@jsprismarine/protocol';

/** A session whose connection records what goes out, speaking for a server. */
const sessionFor = (server: Server) => {
    const sent: DataPacket[] = [];
    const connection = stub<ClientConnection>({ sendDataPacket: async (packet) => void sent.push(packet) });
    const player = stub<Player>({ getServer: () => server, getName: () => 'runner' });
    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection,
        player,
        server
    });

    return { session, sent };
};

const logger = () => stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} });

/** The config both paths read, with everything the server has set to go out. */
const everyRecipe = () => stub<Config>({ getCraftingRecipeLimit: () => -1 });

/** A server with nothing registered and no content build. */
const captureServer = (overrides: Partial<Server> = {}) =>
    stub<Server>({
        getLogger: logger,
        getConfig: everyRecipe,
        getContent: () => undefined,
        getBlockManager: () => ({ getBlocks: () => [] }),
        getItemManager: () => ({ getItems: () => [] }),
        ...overrides
    });

/** A server running the fixture content, with its payloads already built. */
const contentServer = () => {
    const content = buildServerContent(fixtureContentOptions());
    const payloads = joinContentPayloads(content, logger(), { clientPalette: fixtureBlockPalette() });
    if (payloads === undefined) throw new Error('the fixture content produced no payloads');

    return {
        payloads,
        server: stub<Server>({ getLogger: logger, getConfig: everyRecipe, getContent: () => content })
    };
};

const creativePacket = (sent: readonly DataPacket[]): CreativeContentPacket => {
    const packet = sent.find((candidate) => candidate instanceof CreativeContentPacket);
    if (packet === undefined) throw new Error('no CreativeContentPacket was sent');

    return packet;
};

const craftingPacket = (sent: readonly DataPacket[]): CraftingDataPacket => {
    const packet = sent.find((candidate) => candidate instanceof CraftingDataPacket);
    if (packet === undefined) throw new Error('no CraftingDataPacket was sent');

    return packet;
};

describe('PlayerSession', () => {
    describe('sendCreativeContents', () => {
        it('sends the captured catalog when no content was built', async () => {
            CreativeInventory.reset();
            const { session, sent } = sessionFor(captureServer());

            await session.sendCreativeContents();

            const packet = creativePacket(sent);
            expect(packet.payload).toBeNull();
            expect(packet.entries.length).toBeGreaterThan(0);
        });

        it('sends the content build menu when there is one', async () => {
            const { payloads, server } = contentServer();
            const { session, sent } = sessionFor(server);

            await session.sendCreativeContents();

            // The payload replaces both lists, so nothing reads the server's
            // block and item managers on this path.
            expect(creativePacket(sent).payload).toBe(payloads.creative);
        });

        it('sends an empty menu on request, whatever the content says', async () => {
            const { session, sent } = sessionFor(contentServer().server);

            await session.sendCreativeContents(true);

            const packet = creativePacket(sent);
            expect(packet.payload).toBeNull();
            expect(packet.entries).toEqual([]);
        });
    });

    describe('sendCraftingData', () => {
        it('sends the recipe manager list when no content was built', async () => {
            const recipes = stub<RecipeManager>({ getRecipes: () => [], getNetId: () => 0 });
            const { session, sent } = sessionFor(captureServer({ getRecipeManager: () => recipes }));

            await session.sendCraftingData();

            expect(craftingPacket(sent).payload).toBeNull();
        });

        it('sends the compiled recipes when there is a content build', async () => {
            const { payloads, server } = contentServer();
            const { session, sent } = sessionFor(server);

            await session.sendCraftingData();

            expect(craftingPacket(sent).payload).toBe(payloads.crafting);
        });

        it('sends nothing at all when the limit is zero', async () => {
            const { server } = contentServer();
            const { session, sent } = sessionFor(
                stub<Server>({ ...server, getConfig: () => stub<Config>({ getCraftingRecipeLimit: () => 0 }) })
            );

            await session.sendCraftingData();

            expect(sent).toEqual([]);
        });
    });

    describe('limitCraftingData', () => {
        const crafting: CraftingData = {
            shaped: [],
            shapeless: [],
            smithingTransform: [],
            potionMixes: [
                { inputId: 1, inputMeta: 0, reagentId: 2, reagentMeta: 0, outputId: 3, outputMeta: 0 },
                { inputId: 4, inputMeta: 0, reagentId: 5, reagentMeta: 0, outputId: 6, outputMeta: 0 }
            ],
            cleanRecipes: true
        };

        it('draws the lists down against one budget', () => {
            expect(limitCraftingData(crafting, 1).potionMixes).toHaveLength(1);
            expect(limitCraftingData(crafting, 0).potionMixes).toEqual([]);
            expect(limitCraftingData(crafting, 5).potionMixes).toHaveLength(2);
        });
    });
});
