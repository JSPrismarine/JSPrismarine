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
import { buildServerContent } from '../content/ServerContent';
import { fixtureBlockPalette, fixtureContentOptions } from '../content/testing';
import CreativeInventory from '../inventory/CreativeInventory';
import { stub } from '../testing/stub.test.helper';
import PlayerSession from './PlayerSession';
import type ClientConnection from './ClientConnection';
import { joinContentPayloads } from './contentPayloads';
import CreativeContentPacket from './packet/CreativeContentPacket';
import type DataPacket from './packet/DataPacket';

/** A session whose connection records what goes out, speaking for a server. */
const sessionFor = (server: Server) => {
    const sent: DataPacket[] = [];
    const connection = stub<ClientConnection>({ sendDataPacket: async (packet) => void sent.push(packet) });
    const player = stub<Player>({ getServer: () => server });
    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), { connection, player });

    return { session, sent };
};

const logger = () => stub<Logger>({ info: () => {}, warn: () => {}, error: () => {} });

/** A server with nothing registered and no content build. */
const captureServer = () =>
    stub<Server>({
        getLogger: logger,
        getContent: () => undefined,
        getBlockManager: () => ({ getBlocks: () => [] }),
        getItemManager: () => ({ getItems: () => [] })
    });

const creativePacket = (sent: readonly DataPacket[]): CreativeContentPacket => {
    const packet = sent.find((candidate) => candidate instanceof CreativeContentPacket);
    if (packet === undefined) throw new Error('no CreativeContentPacket was sent');

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
            const content = buildServerContent(fixtureContentOptions());
            const payloads = joinContentPayloads(content, logger(), { clientPalette: fixtureBlockPalette() });
            const { session, sent } = sessionFor(stub<Server>({ getLogger: logger, getContent: () => content }));

            await session.sendCreativeContents();

            // The payload replaces both lists, so nothing reads the server's
            // block and item managers on this path.
            expect(creativePacket(sent).payload).toBe(payloads?.creative);
        });

        it('sends an empty menu on request, whatever the content says', async () => {
            const content = buildServerContent(fixtureContentOptions());
            joinContentPayloads(content, logger(), { clientPalette: fixtureBlockPalette() });
            const { session, sent } = sessionFor(stub<Server>({ getLogger: logger, getContent: () => content }));

            await session.sendCreativeContents(true);

            const packet = creativePacket(sent);
            expect(packet.payload).toBeNull();
            expect(packet.entries).toEqual([]);
        });
    });
});
