import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { constants } from 'node:os';

import type { ScriptHttpChannel, ScriptHttpRequest, ScriptHttpResult } from '@jsprismarine/script-host/host/world';

/** How one request ended, before it has an id: a response, or the code of the error that ended it. */
export type ScriptHttpOutcome =
    | {
          readonly status: number;
          readonly headers: readonly (readonly [string, string])[];
          readonly body: string;
      }
    | { readonly errorCode: number };

/**
 * Sends one request off the tick and settles with how it ended. It never rejects. `signal` aborts
 * it, after which its outcome is dropped.
 */
export type ScriptHttpTransport = (request: ScriptHttpRequest, signal: AbortSignal) => Promise<ScriptHttpOutcome>;

/** One admitted result as a replay trace records it. */
export interface ScriptHttpAdmissionRecord {
    /** The tick whose input step admitted it. */
    readonly tick: number;
    /** Its position among every result the inputs admitted, from 0. */
    readonly order: number;
    readonly result: ScriptHttpResult;
}

/** Receives each admitted result, in admission order. */
export interface ScriptHttpRecorder {
    record(record: ScriptHttpAdmissionRecord): void;
}

/**
 * The code BDS's HTTP client ends a request with when it fails for a reason the operating system
 * gives no number for, such as a timeout: `E_FAIL`, as a signed 32-bit number.
 */
export const HTTP_E_FAIL = -2147467259;

/** The user agent BDS's HTTP client sends, as the `net-http` scenario's echo recorded it. */
export const HTTP_USER_AGENT = 'libhttpclient/1.0.0.0';

/** The error code of a failed request: the operating system's number for its `code`, or {@link HTTP_E_FAIL}. */
const errorCodeOf = (error: unknown): number => {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    const errno: Readonly<Record<string, number | undefined>> = constants.errno;
    return (code === undefined ? undefined : errno[code]) ?? HTTP_E_FAIL;
};

/** The headers a request sends: the script's, then BDS's defaults for those it left out. */
const outgoingHeaders = (request: ScriptHttpRequest, url: URL, body: Buffer): string[] => {
    const named = new Set(request.headers.map(([key]) => key.toLowerCase()));
    const headers: string[] = request.headers.flat();
    if (!named.has('host')) headers.push('Host', url.host);
    if (!named.has('user-agent')) headers.push('User-Agent', HTTP_USER_AGENT);
    if (!named.has('accept')) headers.push('Accept', '*/*');
    if (body.length > 0 && !named.has('content-length')) headers.push('Content-Length', String(body.length));
    return headers;
};

/** Reads a response's status, its headers with their names in lower case, and its body as UTF-8 text. */
const readResponse = async (response: IncomingMessage): Promise<ScriptHttpOutcome> => {
    const chunks: Buffer[] = [];
    for await (const chunk of response) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const raw = response.rawHeaders;
    const headers: (readonly [string, string])[] = [];
    for (let index = 0; index + 1 < raw.length; index += 2) {
        headers.push([(raw[index] ?? '').toLowerCase(), raw[index + 1] ?? '']);
    }
    return { status: response.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString('utf8') };
};

/**
 * Sends requests over the host's network with `node:http` and `node:https`, as BDS's HTTP client
 * does: no redirect followed, BDS's user agent and `Accept` unless the script set them, and a
 * timeout in seconds that ends the request with `E_FAIL`. A connection the operating system refuses
 * ends it with the system's error number, such as 111 for `ECONNREFUSED` on Linux.
 */
export const networkTransport: ScriptHttpTransport = (request, signal) =>
    new Promise((settle) => {
        let url: URL;
        try {
            url = new URL(request.uri);
        } catch {
            settle({ errorCode: HTTP_E_FAIL });
            return;
        }
        const body = Buffer.from(request.body, 'utf8');
        const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (outcome: ScriptHttpOutcome): void => {
            if (timer !== undefined) clearTimeout(timer);
            settle(outcome);
        };
        const outgoing = send(
            url,
            {
                method: request.method.toUpperCase(),
                headers: outgoingHeaders(request, url, body),
                // Node adds no `Connection`, `Host` or `Content-Length` of its own; BDS sends no
                // `Connection` either.
                setDefaultHeaders: false,
                signal
            },
            (response) => {
                readResponse(response).then(finish, (error: unknown) => finish({ errorCode: errorCodeOf(error) }));
            }
        );
        outgoing.on('error', (error) => finish({ errorCode: errorCodeOf(error) }));
        if (request.timeout > 0) {
            timer = setTimeout(() => {
                outgoing.destroy();
                finish({ errorCode: HTTP_E_FAIL });
            }, request.timeout * 1000);
        }
        outgoing.end(body);
    });

/**
 * The scripts' `@minecraft/server-net` requests, as inputs
 * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md),
 * [ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)).
 *
 * A request goes to the transport at once and runs off the tick. Its result waits here until an
 * input step admits it, which records it with its tick, and the next script flush settles the
 * request's promise. A replay installs the recorded results with {@link replay}; from then on each
 * step admits exactly the results recorded for its tick, in recorded order, and no request reaches
 * the network.
 */
export class ScriptHttpInputs implements ScriptHttpChannel {
    private readonly transport: ScriptHttpTransport;
    private readonly inFlight = new Map<number, AbortController>();
    private readonly running = new Set<Promise<void>>();
    private completed: ScriptHttpResult[] = [];
    private admitted: ScriptHttpResult[] = [];
    private order = 0;
    private recorder: ScriptHttpRecorder | undefined;
    private recorded: readonly ScriptHttpAdmissionRecord[] | undefined;

    /** @param transport - What sends a request; the host's network by default. */
    public constructor(transport: ScriptHttpTransport = networkTransport) {
        this.transport = transport;
    }

    /** Requests the transport is still running, for a harness that waits for them. */
    public get inFlightCount(): number {
        return this.inFlight.size;
    }

    /** Starts a request off the tick, unless a replay decides the results. */
    public send(id: number, request: ScriptHttpRequest): void {
        if (this.recorded !== undefined) return;
        const controller = new AbortController();
        this.inFlight.set(id, controller);
        const running = this.transport(request, controller.signal).then(
            (outcome) => {
                // A request canceled while it ran has no result.
                if (this.inFlight.delete(id)) this.completed.push({ id, ...outcome });
            },
            () => {
                if (this.inFlight.delete(id)) this.completed.push({ id, errorCode: HTTP_E_FAIL });
            }
        );
        this.running.add(running);
        void running.finally(() => this.running.delete(running));
    }

    /** Abandons a request in flight. */
    public cancel(id: number): void {
        this.inFlight.get(id)?.abort();
        this.inFlight.delete(id);
        this.completed = this.completed.filter((result) => result.id !== id);
    }

    /**
     * The input step: admits the results that arrived since the last step, or in a replay the ones
     * recorded for this tick, and records each.
     * @returns How many it admitted.
     */
    public admit(tick: number): number {
        const results =
            this.recorded === undefined
                ? this.completed.splice(0)
                : this.recorded.filter((record) => record.tick === tick).map((record) => record.result);
        for (const result of results) {
            this.recorder?.record({ tick, order: this.order++, result });
            this.admitted.push(result);
        }
        return results.length;
    }

    /** The results the input step admitted since the last call, in the order it admitted them. */
    public takeResponses(): readonly ScriptHttpResult[] {
        return this.admitted.splice(0);
    }

    /** Sets what receives each admitted result, or stops recording. */
    public setRecorder(recorder: ScriptHttpRecorder | undefined): void {
        this.recorder = recorder;
    }

    /**
     * Replays a recorded session: from now on each step admits the results recorded for its tick,
     * and no request reaches the transport. The requests already running are abandoned.
     */
    public replay(records: readonly ScriptHttpAdmissionRecord[]): void {
        this.recorded = records;
        this.close();
    }

    /** Settles once every request the transport is running has ended, for a harness between ticks. */
    public async settled(): Promise<void> {
        while (this.running.size > 0) await Promise.allSettled([...this.running]);
    }

    /** Abandons every request in flight, as the server stops. */
    public close(): void {
        for (const controller of this.inFlight.values()) controller.abort();
        this.inFlight.clear();
        this.completed = [];
    }
}
