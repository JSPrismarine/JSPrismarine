import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { SignalStructure, SignalType } from './protocol/Signal';
import { HttpSignaling } from './HttpSignaling';
import type { NetherNetOfferAnswerer } from './HttpSignaling';

const OFFER = 'v=0\r\na=identity:client-token\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';

/** An answerer that records offers and answers each the way a test decides. */
const fakeAnswerer = (answer: (signal: SignalStructure, respond: (signal: SignalStructure) => void) => void) => {
    const offers: SignalStructure[] = [];
    const closed: bigint[] = [];
    const connections = new Map<bigint, { close(reason?: string): void }>();
    const answerer: NetherNetOfferAnswerer = {
        connections,
        handleOffer: async (signal, respond) => {
            offers.push(signal);
            connections.set(signal.connectionId, { close: () => void closed.push(signal.connectionId) });
            answer(signal, respond);
        }
    };
    return { answerer, offers, closed, connections };
};

const running: HttpSignaling[] = [];

/** Starts signaling on an ephemeral loopback port and returns its base URL. */
const start = async (
    answerer: NetherNetOfferAnswerer,
    answerTimeoutMs?: number,
    debug: (line: string) => void = () => {}
) => {
    const signaling = new HttpSignaling({
        answerer,
        status: () => '{"name":"Test"}',
        sign: (answer) => `${answer}a=identity:signed\r\n`,
        logger: { debug, info: () => {}, warn: () => {}, error: () => {} },
        answerTimeoutMs
    });
    running.push(signaling);
    const port = await signaling.listen(0, '127.0.0.1');
    return `http://127.0.0.1:${port}`;
};

const post = (url: string, body: string) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body });

describe('HttpSignaling', () => {
    afterEach(() => {
        for (const signaling of running.splice(0)) signaling.close();
    });

    it('answers GET /v1/join with the status, as JSON', async () => {
        const base = await start(fakeAnswerer(() => {}).answerer);

        const response = await fetch(`${base}/v1/join`);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/json');
        expect(await response.text()).toBe('{"name":"Test"}');
    });

    it('turns a posted offer into a signed answer', async () => {
        const { answerer, offers } = fakeAnswerer((signal, respond) => {
            // Candidates already sit in the answer; a later CANDIDATEADD changes nothing.
            respond(new SignalStructure(SignalType.CandidateAdd, signal.connectionId, 'candidate:1', signal.networkId));
            respond(new SignalStructure(SignalType.ConnectResponse, signal.connectionId, 'v=0\r\n', signal.networkId));
        });
        const base = await start(answerer);

        const response = await post(`${base}/v1/join/18446744073709551615`, OFFER);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/sdp');
        expect(await response.text()).toBe('v=0\r\na=identity:signed\r\n');
        expect(offers).toHaveLength(1);
        expect(offers[0]!.type).toBe(SignalType.ConnectRequest);
        // The client's identity is NetherNet's to check; WebRTC never sees it.
        expect(offers[0]!.data).toBe('v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n');
    });

    it.each([
        ['a GUID', '3f2504e0-4f89-11d3-9a0c-0305e82c3301', '3f2504e0-4f89-11d3-9a0c-0305e82c3301'],
        ['text with a line break, which it quotes in the log', 'a%0Ab', '"a\\nb"']
    ])('takes %s for a network ID, which the guide leaves opaque', async (_name, segment, logged) => {
        const { answerer } = fakeAnswerer((signal, respond) =>
            respond(new SignalStructure(SignalType.ConnectResponse, signal.connectionId, 'v=0\r\n'))
        );
        const lines: string[] = [];
        const base = await start(answerer, undefined, (line) => lines.push(line));

        const response = await post(`${base}/v1/join/${segment}`, OFFER);

        expect(response.status).toBe(200);
        expect(lines[0]).toContain(`(network ${logged})`);
    });

    describe('the address a client dialed', () => {
        /** Posts an offer under a `Host` header and returns what `sign` was told the client dialed. */
        const dialedWith = async (host: string, resolve?: (hostname: string) => Promise<string[]>) => {
            const { answerer } = fakeAnswerer((signal, respond) =>
                respond(new SignalStructure(SignalType.ConnectResponse, signal.connectionId, 'v=0\r\n'))
            );
            const seen: unknown[] = [];
            const signaling = new HttpSignaling({
                answerer,
                status: () => '{}',
                sign: (answer, dialed) => {
                    seen.push(dialed);
                    return answer;
                },
                logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
                ...(resolve === undefined ? {} : { resolve })
            });
            running.push(signaling);
            const port = await signaling.listen(0, '127.0.0.1');
            const join = () =>
                new Promise<void>((done, fail) => {
                    const request = http.request(
                        { host: '127.0.0.1', port, path: '/v1/join/1', method: 'POST', setHost: false },
                        (response) => response.resume().on('end', done)
                    );
                    request.setHeader('Host', host);
                    request.on('error', fail).end(OFFER);
                });
            await join();
            return { dialed: seen[0], port, seen, join };
        };

        it.each([
            ['an IPv4 address and its port', '203.0.113.9:25565', ['203.0.113.9'], 25565],
            ['an IPv6 address in brackets', '[2001:db8::7]:25565', ['2001:db8::7'], 25565]
        ])('reads %s from the Host header', async (_name, host, addresses, dialedPort) => {
            const { dialed, port } = await dialedWith(host);

            expect(dialed).toStrictEqual({ addresses, port: dialedPort, localPort: port });
        });

        it('takes the port signaling listens on for a Host without one', async () => {
            const { dialed, port } = await dialedWith('203.0.113.9');

            expect(dialed).toStrictEqual({ addresses: ['203.0.113.9'], port, localPort: port });
        });

        it('resolves a hostname once, and remembers what it resolved to', async () => {
            const asked: string[] = [];
            const { dialed, seen, join } = await dialedWith('Play.Example.com:19132', async (hostname) => {
                asked.push(hostname);
                return ['203.0.113.9', '2001:db8::7'];
            });
            await join();

            expect(dialed).toMatchObject({ addresses: ['203.0.113.9', '2001:db8::7'], port: 19132 });
            expect(seen[1]).toStrictEqual(dialed);
            expect(asked).toStrictEqual(['play.example.com']);
        });

        it.each([
            ['a Host that is no hostname', 'not a host:19132'],
            ['a hostname that does not resolve', 'gone.example.com:19132']
        ])('names nothing for %s, and still answers', async (_name, host) => {
            const { dialed, seen } = await dialedWith(host, async () => {
                throw new Error('ENOTFOUND');
            });

            expect(seen).toHaveLength(1);
            expect(dialed).toBeUndefined();
        });
    });

    it('picks a connection ID no live peer has for every offer', async () => {
        const { answerer, offers } = fakeAnswerer((signal, respond) =>
            respond(new SignalStructure(SignalType.ConnectResponse, signal.connectionId, 'v=0\r\n', signal.networkId))
        );
        const base = await start(answerer);

        await post(`${base}/v1/join/1`, OFFER);
        await post(`${base}/v1/join/1`, OFFER);

        expect(new Set(offers.map((offer) => offer.connectionId)).size).toBe(2);
    });

    it('fails the request with the error code when negotiation fails', async () => {
        const { answerer } = fakeAnswerer((signal, respond) =>
            respond(new SignalStructure(SignalType.ConnectError, signal.connectionId, '13', signal.networkId))
        );
        const base = await start(answerer);

        const response = await post(`${base}/v1/join/1`, OFFER);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe('13');
    });

    it('answers 500 when negotiating the offer throws, and logs why', async () => {
        const errors: unknown[] = [];
        const answerer: NetherNetOfferAnswerer = {
            connections: new Map(),
            handleOffer: async () => {
                throw new Error('peer connection failed');
            }
        };
        const signaling = new HttpSignaling({
            answerer,
            status: () => '{}',
            sign: (answer) => answer,
            logger: { debug: () => {}, info: () => {}, warn: () => {}, error: (error) => void errors.push(error) }
        });
        running.push(signaling);
        const port = await signaling.listen(0, '127.0.0.1');

        const response = await post(`http://127.0.0.1:${port}/v1/join/1`, OFFER);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe('An error occurred while answering');
        expect(String(errors[0])).toContain('peer connection failed');
    });

    it('gives up on an offer that is never answered and closes its peer', async () => {
        const { answerer, closed, offers } = fakeAnswerer(() => {});
        const base = await start(answerer, 50);

        const response = await post(`${base}/v1/join/1`, OFFER);

        expect(response.status).toBe(504);
        expect(closed).toStrictEqual([offers[0]!.connectionId]);
    });

    it.each([
        ['an empty network ID', '/v1/join/', OFFER, 400],
        ['a network ID longer than one can be', `/v1/join/${'1'.repeat(129)}`, OFFER, 400],
        ['an empty offer', '/v1/join/1', '', 400],
        ['an offer too large to be one', '/v1/join/1', 'x'.repeat(64 * 1024 + 1), 413]
    ])('refuses %s', async (_name, path, body, status) => {
        const { answerer, offers } = fakeAnswerer(() => {});
        const base = await start(answerer);

        const response = await post(`${base}${path}`, body);

        expect(response.status).toBe(status);
        expect(offers).toHaveLength(0);
    });

    it('answers anything else with 404, as Bedrock Dedicated Server does', async () => {
        const base = await start(fakeAnswerer(() => {}).answerer);

        for (const response of [await fetch(`${base}/`), await post(`${base}/v1/join`, OFFER)]) {
            expect(response.status).toBe(404);
            expect(await response.text()).toBe('Not Found');
        }
    });
});
