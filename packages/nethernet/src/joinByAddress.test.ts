import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { SignalStructure, SignalType } from 'nethernet';
import { HttpSignaling } from './HttpSignaling';
import { exchangeOffer, JoinRefusedError, probeJoin } from './joinByAddress';
import { joinStatusJson } from './NetherNetStatus';
import type { NetherNetStatus } from './NetherNetStatus';

const STATUS: NetherNetStatus = {
    motd: 'A server',
    levelName: 'world',
    protocol: 2225,
    version: '1.26.60',
    playerCount: 1,
    maxPlayers: 20,
    gameType: 0
};

const closers: (() => void)[] = [];

/** Signaling that answers every offer with `answer`, or fails it with `error`. */
const signaling = async (outcome: { answer: string } | { error: string }) => {
    const server = new HttpSignaling({
        answerer: {
            connections: new Map(),
            handleOffer: async (signal, respond) => {
                const [type, data] =
                    'answer' in outcome
                        ? [SignalType.ConnectResponse, outcome.answer]
                        : [SignalType.ConnectError, outcome.error];
                respond(new SignalStructure(type, signal.connectionId, data, signal.networkId));
            }
        },
        status: () => joinStatusJson(STATUS),
        sign: (answer) => `${answer}a=identity:signed\r\n`,
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    });
    closers.push(() => server.close());
    return { host: '127.0.0.1', port: await server.listen(0, '127.0.0.1') };
};

describe('joinByAddress', () => {
    afterEach(() => {
        for (const close of closers.splice(0)) close();
    });

    it('reads the status a NetherNet server answers GET /v1/join with', async () => {
        expect(await probeJoin(await signaling({ answer: '' }))).toStrictEqual({ status: STATUS });
    });

    it('takes a 2xx with an empty body as NetherNet with no status, as Bedrock Dedicated Server sends', async () => {
        const quiet = http.createServer((_request, response) => response.writeHead(200).end());
        await new Promise<void>((resolve) => quiet.listen(0, '127.0.0.1', resolve));
        closers.push(() => quiet.close());
        const bound = quiet.address();
        if (typeof bound !== 'object' || bound === null) throw new Error('not listening on TCP');

        expect(await probeJoin({ host: '127.0.0.1', port: bound.port })).toStrictEqual({});
    });

    it('says a server that answers GET /v1/join with an error does not speak NetherNet', async () => {
        // A RakNet-only server's TCP side, or a website on the same port, answers like this.
        const other = http.createServer((_request, response) => response.writeHead(404).end('Not Found'));
        await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
        closers.push(() => other.close());
        const bound = other.address();
        if (typeof bound !== 'object' || bound === null) throw new Error('not listening on TCP');

        expect(await probeJoin({ host: '127.0.0.1', port: bound.port })).toBeUndefined();
    });

    it('trades an offer for the signed answer', async () => {
        const address = await signaling({ answer: 'v=0\r\n' });

        expect(await exchangeOffer(address, 42n, 'v=0\r\n')).toBe('v=0\r\na=identity:signed\r\n');
    });

    it('throws with the status and body when the server refuses the offer', async () => {
        const address = await signaling({ error: '13' });

        const refusal = exchangeOffer(address, 42n, 'v=0\r\n');
        await expect(refusal).rejects.toBeInstanceOf(JoinRefusedError);
        await expect(refusal).rejects.toMatchObject({ status: 500, body: '13' });
    });
});
