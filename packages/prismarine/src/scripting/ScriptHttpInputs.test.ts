import { once } from 'node:events';
import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { constants } from 'node:os';

import type { ScriptHttpRequest } from '@jsprismarine/script-host/host/world';
import { afterEach, describe, expect, it } from 'vitest';

import type { ScriptHttpAdmissionRecord, ScriptHttpOutcome, ScriptHttpTransport } from './ScriptHttpInputs';
import { HTTP_E_FAIL, HTTP_USER_AGENT, networkTransport, ScriptHttpInputs } from './ScriptHttpInputs';

const request = (uri: string, overrides: Partial<ScriptHttpRequest> = {}): ScriptHttpRequest => ({
    uri,
    method: 'Get',
    headers: [],
    body: '',
    timeout: 0,
    ...overrides
});

/** A transport the test answers by hand, which counts what it was asked. */
const manualTransport = () => {
    const calls: { readonly request: ScriptHttpRequest; readonly answer: (outcome: ScriptHttpOutcome) => void }[] = [];
    const transport: ScriptHttpTransport = (sent) =>
        new Promise((answer) => {
            calls.push({ request: sent, answer });
        });
    return { calls, transport };
};

describe('ScriptHttpInputs', () => {
    it('holds a result until an input step admits it, and records it with that tick', async () => {
        const { calls, transport } = manualTransport();
        const inputs = new ScriptHttpInputs(transport);
        const recorded: ScriptHttpAdmissionRecord[] = [];
        inputs.setRecorder({ record: (record) => recorded.push(record) });

        inputs.send(1, request('http://a/'));
        inputs.send(2, request('http://b/'));
        expect(calls).toHaveLength(2);
        calls[1]?.answer({ status: 200, headers: [], body: 'b' });
        // The other request is still running, so only a turn of the event loop lets this one land.
        await new Promise((turned) => setImmediate(turned));
        expect(inputs.takeResponses()).toEqual([]);

        expect(inputs.admit(7)).toBe(1);
        expect(inputs.takeResponses()).toEqual([{ id: 2, status: 200, headers: [], body: 'b' }]);
        calls[0]?.answer({ errorCode: 111 });
        await inputs.settled();
        expect(inputs.admit(9)).toBe(1);
        expect(recorded).toEqual([
            { tick: 7, order: 0, result: { id: 2, status: 200, headers: [], body: 'b' } },
            { tick: 9, order: 1, result: { id: 1, errorCode: 111 } }
        ]);
    });

    it('drops the result of a request canceled while it ran', async () => {
        const { calls, transport } = manualTransport();
        const inputs = new ScriptHttpInputs(transport);
        inputs.send(1, request('http://a/'));
        inputs.cancel(1);
        calls[0]?.answer({ status: 200, headers: [], body: '' });
        await inputs.settled();
        expect(inputs.admit(0)).toBe(0);
    });

    it('replays the recorded results at their ticks and never reaches the transport', () => {
        const { calls, transport } = manualTransport();
        const inputs = new ScriptHttpInputs(transport);
        inputs.replay([
            { tick: 3, order: 0, result: { id: 1, status: 404, headers: [], body: '' } },
            { tick: 5, order: 1, result: { id: 2, errorCode: HTTP_E_FAIL } }
        ]);
        inputs.send(1, request('http://a/'));
        inputs.send(2, request('http://b/'));
        expect(calls).toEqual([]);
        const admitted = [0, 1, 2, 3, 4, 5].map((tick) => {
            inputs.admit(tick);
            return inputs.takeResponses().map((result) => result.id);
        });
        expect(admitted).toEqual([[], [], [], [1], [], [2]]);
    });
});

describe('networkTransport', () => {
    let server: HttpServer | undefined;
    afterEach(async () => {
        server?.closeAllConnections();
        if (server !== undefined) await new Promise((closed) => server?.close(closed));
        server = undefined;
    });

    /** Starts a loopback server that echoes each request and answers `/redirect` with a 302. */
    const listen = async (): Promise<string> => {
        server = createServer((incoming, response) => {
            const chunks: Buffer[] = [];
            incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
            incoming.on('end', () => {
                if (incoming.url === '/slow') return;
                const status = incoming.url === '/redirect' ? 302 : 200;
                response.writeHead(status, { 'X-Echo': 'yes', ...(status === 302 ? { Location: '/' } : {}) });
                response.end(
                    JSON.stringify({
                        method: incoming.method,
                        headers: incoming.rawHeaders,
                        body: Buffer.concat(chunks).toString('utf8')
                    })
                );
            });
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const { port } = server.address() as AddressInfo; // listen() on a TCP port gives an AddressInfo.
        return `http://127.0.0.1:${port}`;
    };

    const signal = () => new AbortController().signal;

    it("sends BDS's default headers and the body, and reads response header names in lower case", async () => {
        const base = await listen();
        const outcome = await networkTransport(
            request(`${base}/echo`, { method: 'Post', headers: [['X-Key', 'v']], body: 'hi' }),
            signal()
        );
        if (!('status' in outcome)) throw new Error(`the request failed with ${outcome.errorCode}`);
        expect(outcome.status).toBe(200);
        expect(outcome.headers.map(([key]) => key)).toContain('x-echo');
        const echoed = JSON.parse(outcome.body);
        expect(echoed.method).toBe('POST');
        expect(echoed.body).toBe('hi');
        expect(echoed.headers).toEqual([
            'X-Key',
            'v',
            'Host',
            base.slice('http://'.length),
            'User-Agent',
            HTTP_USER_AGENT,
            'Accept',
            '*/*',
            'Content-Length',
            '2'
        ]);
    });

    it('does not follow a redirect', async () => {
        const base = await listen();
        const outcome = await networkTransport(request(`${base}/redirect`), signal());
        expect('status' in outcome && outcome.status).toBe(302);
    });

    it("ends a refused connection with the system's error number", async () => {
        const base = await listen();
        const closed = base;
        server?.close();
        server = undefined;
        expect(await networkTransport(request(`${closed}/`), signal())).toEqual({
            errorCode: constants.errno.ECONNREFUSED
        });
    });

    it('ends a request past its timeout with E_FAIL', async () => {
        const base = await listen();
        expect(await networkTransport(request(`${base}/slow`, { timeout: 1 }), signal())).toEqual({
            errorCode: HTTP_E_FAIL
        });
    });
});
