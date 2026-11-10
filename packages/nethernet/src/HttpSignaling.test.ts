import { afterEach, describe, expect, it } from 'vitest';

import { SignalStructure, SignalType } from 'nethernet';
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
const start = async (answerer: NetherNetOfferAnswerer, answerTimeoutMs?: number) => {
    const signaling = new HttpSignaling({
        answerer,
        status: () => '{"name":"Test"}',
        sign: (answer) => `${answer}a=identity:signed\r\n`,
        logger: { debug: () => {}, error: () => {} },
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
        expect(offers[0]!.networkId).toBe(18446744073709551615n);
        // The client's identity is NetherNet's to check; WebRTC never sees it.
        expect(offers[0]!.data).toBe('v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n');
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
            logger: { debug: () => {}, error: (error) => void errors.push(error) }
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
        ['a network ID that is not a number', '/v1/join/abc', OFFER, 400],
        ['a network ID past 64 bits', '/v1/join/18446744073709551616', OFFER, 400],
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
