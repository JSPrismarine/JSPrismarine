import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import type { Config } from '../../config/Config';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import { RequestChunkRadiusPacket } from '@jsprismarine/protocol';
import RequestChunkRadiusHandler from './RequestChunkRadiusHandler';

const request = (radius: number, maxRadius: number): RequestChunkRadiusPacket =>
    new RequestChunkRadiusPacket({ radius, maxRadius });

/** Runs the handler against a server with the given view distance and returns what it granted and logged. */
const run = async (
    packet: RequestChunkRadiusPacket,
    serverMax: number
): Promise<{ granted: number | undefined; logged: string[] }> => {
    let granted: number | undefined;
    const logged: string[] = [];
    const server = stub<Server>({
        getConfig: () => stub<Config>({ getViewDistance: () => serverMax }),
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({
        getPlayer: () => stub<Player>({ getName: () => 'Steve' }),
        setViewDistance: async (distance) => void (granted = distance)
    });

    await new RequestChunkRadiusHandler().handle(packet, server, session);

    return { granted, logged };
};

const grant = async (packet: RequestChunkRadiusPacket, serverMax: number): Promise<number | undefined> =>
    (await run(packet, serverMax)).granted;

describe('RequestChunkRadiusHandler', () => {
    it('records the request and the grant', async () => {
        // The radius exchange is what lets a client accept terrain, so a join that stalls has to
        // show whether it happened.
        const { logged } = await run(request(10, 6), 12);

        expect(logged).toEqual(['Steve asked for a chunk radius of 10 (max 6), granted 6']);
    });

    it('grants the requested radius when both the client and the server allow it', async () => {
        expect(await grant(request(8, 16), 12)).toBe(8);
    });

    it('caps the grant at the client max', async () => {
        // A client that states a Max ChunkRadius cannot render past it, whatever it asked for.
        expect(await grant(request(10, 6), 12)).toBe(6);
    });

    it('caps the grant at the server view distance', async () => {
        expect(await grant(request(32, 48), 12)).toBe(12);
    });

    it('ignores a client max of zero', async () => {
        // A zero byte means the client did not state one.
        expect(await grant(request(8, 0), 12)).toBe(8);
    });

    it('never grants less than one chunk', async () => {
        // A radius of 0 would switch terrain off for the player.
        expect(await grant(request(0, 0), 12)).toBe(1);
        expect(await grant(request(-4, 0), 12)).toBe(1);
    });
});
