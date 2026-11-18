/**
 * The local HTTP server a `server-net` scenario's scripts send their requests to. The BDS capture
 * and JSPrismarine's runner start the same server on the loopback address, so a scenario never
 * reaches the internet, and every response it sends is fixed: no `Date` header, a fixed
 * `Content-Length`, and a closed connection after each response.
 *
 * Routes:
 *
 * - `/hello` answers 200 with `hello` and an `X-Scenario` header.
 * - `/echo` answers 200 with the request's method, headers and body as JSON, the headers in
 *   byte order of their lower-case names.
 * - `/status/<code>` answers with that status and no body.
 * - `/redirect` answers 302 to `/hello`.
 * - `/slow` holds the request until the server closes, for a timeout or a cancel.
 *
 * This module imports nothing beyond node and relative paths, so the capture script runs it
 * under plain node.
 */
import { readdirSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { isRecord } from '../isRecord.ts';
import type { ScriptScenario } from './scenarios.ts';
import { scenarioConfigDirectory } from './scenarios.ts';

/** The variable of a pack's `variables.json` that holds the scenario server's address. */
export const HTTP_BASE_VARIABLE = 'base';

/**
 * The address a scenario's scripts send their requests to: the `base` variable of a module's
 * `variables.json` in the scenario's `config/` folder, such as `http://127.0.0.1:29180`.
 * @returns Undefined for a scenario with no such variable.
 */
export const scenarioHttpBase = (scenario: ScriptScenario): URL | undefined => {
    const config = scenarioConfigDirectory(scenario);
    if (config === undefined) return undefined;
    for (const folder of readdirSync(config).sort()) {
        let variables: unknown;
        try {
            variables = JSON.parse(readFileSync(join(config, folder, 'variables.json'), 'utf8'));
        } catch {
            continue;
        }
        const base = isRecord(variables) ? variables[HTTP_BASE_VARIABLE] : undefined;
        if (typeof base === 'string') return new URL(base);
    }
    return undefined;
};

/** A running scenario HTTP server. */
export interface ScenarioHttpServer {
    /** The requests it received, as `<method> <path>`, in the order they arrived. */
    readonly requests: readonly string[];
    /** Answers the held requests, closes every connection and stops listening. */
    close(): Promise<void>;
}

const send = (response: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void => {
    const bytes = Buffer.from(body, 'utf8');
    response.sendDate = false;
    response.writeHead(status, {
        ...headers,
        Connection: 'close',
        'Content-Length': String(bytes.length)
    });
    response.end(bytes);
};

const readBody = async (request: IncomingMessage): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return Buffer.concat(chunks).toString('utf8');
};

/**
 * Starts the scenario HTTP server on the host and port of `base`.
 * @throws Error when the port is taken.
 */
export const startScenarioHttpServer = async (base: URL): Promise<ScenarioHttpServer> => {
    const requests: string[] = [];
    const held: ServerResponse[] = [];
    const server = createServer((request, response) => {
        const path = request.url ?? '/';
        requests.push(`${request.method ?? ''} ${path}`);
        void readBody(request).then((body) => {
            if (path === '/hello') {
                send(response, 200, 'hello', { 'Content-Type': 'text/plain', 'X-Scenario': 'net-http' });
            } else if (path === '/echo') {
                const headers = Object.entries(request.headers)
                    .map(([key, value]): [string, string] => [
                        key,
                        Array.isArray(value) ? value.join(', ') : (value ?? '')
                    ])
                    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
                send(response, 200, JSON.stringify({ method: request.method, headers, body }), {
                    'Content-Type': 'application/json'
                });
            } else if (path.startsWith('/status/')) {
                send(response, Number(path.slice('/status/'.length)), '');
            } else if (path === '/redirect') {
                send(response, 302, '', { Location: '/hello' });
            } else if (path === '/slow') {
                held.push(response);
            } else {
                send(response, 404, 'no such route');
            }
        });
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(Number(base.port), base.hostname, () => resolve());
    });
    return {
        requests,
        close: async () => {
            for (const response of held.splice(0)) response.destroy();
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    };
};
