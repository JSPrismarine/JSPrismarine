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
import { CraftingDataPacket, CreativeContentPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type Server from '../Server';
import type { Config } from '../config/Config';
import { buildServerContent } from '../content/ServerContent';
import { fixtureBlockPalette, fixtureContentOptions } from '../content/testing';
import type RecipeManager from '../crafting/RecipeManager';
import CreativeInventory from '../inventory/CreativeInventory';
import type { StubMembers } from '../testing/stub.test.helper';
import { stub } from '../testing/stub.test.helper';
import PlayerSession from './PlayerSession';
import type ClientConnection from './ClientConnection';
import { joinContentPayloads, limitCraftingData } from './contentPayloads';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
import type { ProtocolCodec } from './codec/ProtocolCodec';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';

import type { CraftingData, CreativeContent } from '@jsprismarine/protocol';
import { testContent } from '../testing/entityServer';

/** A session whose connection records what goes out, speaking for a server. */
const sessionFor = (server: Server, codec: ProtocolCodec = Codec2193) => {
    const sent: NetworkPacket[] = [];
    const connection = stub<ClientConnection>({
        codec,
        sendDataPacket: async (packet) => void sent.push(packet)
    });
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
const captureServer = (overrides: StubMembers<Server> = {}) =>
    stub<Server>({
        getLogger: logger,
        getConfig: everyRecipe,
        getContent: () => testContent(),
        getCreativeInventory: () => new CreativeInventory(() => testContent()),
        ...overrides
    });

/** A server running the fixture content, with its payloads already built. */
const contentServer = (codec: ProtocolCodec = Codec2193) => {
    const content = buildServerContent(fixtureContentOptions());
    const payloads = joinContentPayloads(content, logger(), {
        clientPalette: fixtureBlockPalette(),
        itemData: codec.itemData
    });
    if (payloads === undefined) throw new Error('the fixture content produced no payloads');

    return {
        payloads,
        server: stub<Server>({ getLogger: logger, getConfig: everyRecipe, getContent: () => content })
    };
};

const creativePacket = (sent: readonly NetworkPacket[]): CreativeContentPacket => {
    const packet = sent.find((candidate) => candidate instanceof CreativeContentPacket);
    if (packet === undefined) throw new Error('no CreativeContentPacket was sent');

    return packet;
};

const creativeContent = (sent: readonly NetworkPacket[]): CreativeContent => {
    const content = creativePacket(sent).getPacketData();
    if (content === null) throw new Error('CreativeContentPacket has no payload');

    return content;
};

const craftingPacket = (sent: readonly NetworkPacket[]): CraftingDataPacket => {
    const packet = sent.find((candidate) => candidate instanceof CraftingDataPacket);
    if (packet === undefined) throw new Error('no CraftingDataPacket was sent');

    return packet;
};

const craftingData = (sent: readonly NetworkPacket[]): CraftingData => {
    const data = craftingPacket(sent).getPacketData();
    if (data === null) throw new Error('CraftingDataPacket has no payload');

    return data;
};

describe('PlayerSession', () => {
    describe('sendCreativeContents', () => {
        it('sends the captured catalog when no content was built', async () => {
            const { session, sent } = sessionFor(captureServer());

            await session.sendCreativeContents();

            expect(creativeContent(sent).entries.length).toBeGreaterThan(0);
        });

        it('sends the content build menu when there is one', async () => {
            const { payloads, server } = contentServer();
            const { session, sent } = sessionFor(server);

            await session.sendCreativeContents();

            expect(creativeContent(sent)).toBe(payloads.creative);
        });

        /**
         * The menu carries item numbers rather than names - a creative pick comes back as a
         * position and the stack beside it is numbered - so it moves with the item table, and
         * the table is a property of the negotiated protocol.
         */
        it('sends the menu built for the protocol the session negotiated', async () => {
            const { payloads, server } = contentServer();
            const at2225 = joinContentPayloads(server.getContent(), logger(), {
                clientPalette: fixtureBlockPalette(),
                itemData: Codec2225.itemData
            });

            expect(at2225?.creative).not.toBe(payloads.creative);

            const { session, sent } = sessionFor(server, Codec2225);
            await session.sendCreativeContents();

            expect(creativeContent(sent)).toBe(at2225?.creative);
        });

        it('sends an empty menu on request, whatever the content says', async () => {
            const { session, sent } = sessionFor(contentServer().server);

            await session.sendCreativeContents(true);

            expect(creativeContent(sent)).toEqual({ groups: [], entries: [] });
        });
    });

    describe('sendCraftingData', () => {
        it('sends the recipe manager list when no content was built', async () => {
            const recipes = stub<RecipeManager>({ getRecipes: () => [], getNetId: () => 0 });
            const { session, sent } = sessionFor(captureServer({ getRecipeManager: () => recipes }));

            await session.sendCraftingData();

            expect(craftingData(sent)).toEqual({
                shaped: [],
                shapeless: [],
                smithingTransform: [],
                potionMixes: [],
                cleanRecipes: true
            });
        });

        it('sends the compiled recipes when there is a content build', async () => {
            const { payloads, server } = contentServer();
            const { session, sent } = sessionFor(server);

            await session.sendCraftingData();

            expect(craftingData(sent)).toBe(payloads.crafting);
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
