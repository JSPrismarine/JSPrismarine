/**
 * The behavior of `@minecraft/server-net`'s HTTP client for one pack: `HttpRequest`, `HttpHeader`,
 * `HttpResponse`, and `http.get`, `http.request` and `http.cancelAll`. The packet events and the
 * WebSocket client are present and throw `NotImplementedError`
 * ([ADR 0022](../../../../docs/adr/0022-the-script-api-surface-is-generated.md)).
 *
 * A request and a header keep what a script sets in their state, so a script reads back a copy:
 * `request.headers` makes new `HttpHeader`s each time. Sending one returns a promise that a later
 * script flush settles, once the network's result has entered the world as an input
 * ({@link ScriptHttp}). What the pinned Bedrock Dedicated Server does, the `net-http` scenario of
 * the parity suite's `scripting.net` family recorded: a URI that is not `http` or `https` rejects
 * with `MalformedUriError`, a network failure rejects with `InternalHttpRequestError` and the
 * error's code, and `cancelAll` rejects every request in flight with a plain `Error` of its reason.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../errors';
import { isRecord } from '../isRecord';
import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import { ADMIN_TAG, SERVER_ADMIN, secretState, secretText } from './serverAdmin';
import type { ScriptDeferred } from './serverGametest';
import type { PackNet } from './netKit';
import type { HttpSettlement } from './ScriptHttp';
import { plainError } from './serverObjects';
import type { ScriptHttpMethod, ScriptHttpRequest, ScriptHttpResult } from './world';

/** The module the implementations here belong to. */
export const SERVER_NET = '@minecraft/server-net';

/** The tags of the objects this module's members make. */
export const NET_TAG = {
    /** An `HttpHeader`; its state is a {@link HeaderState}. */
    header: 41,
    /** An `HttpRequest`; its state is a {@link RequestState}. */
    request: 42,
    /** An `HttpResponse`; its state is a {@link ResponseState}. */
    response: 43
} as const;

/** A header as a request keeps it: its value's text, or a secret's. */
type HeaderState = { readonly key: string; readonly value: string } | { readonly key: string; readonly secret: string };

/** What an `HttpRequest` holds. */
interface RequestState {
    readonly uri: string;
    readonly method: ScriptHttpMethod;
    readonly body: string;
    readonly headers: readonly HeaderState[];
    readonly timeout: number;
}

/** What an `HttpResponse` holds. */
interface ResponseState {
    readonly status: number;
    readonly body: string;
    readonly headers: readonly (readonly [string, string])[];
    readonly request: RequestState;
}

const METHODS: readonly ScriptHttpMethod[] = ['Delete', 'Get', 'Head', 'Patch', 'Post', 'Put'];
const isMethod = (value: unknown): value is ScriptHttpMethod => METHODS.some((method) => method === value);

/** A new request's state: a `Get` with no body, no headers and no timeout, as BDS makes one. */
const newRequest = (uri: string): RequestState => ({ uri, method: 'Get', body: '', headers: [], timeout: 0 });

const parseState = (state: string, what: string): Record<string, unknown> => {
    // The host wrote every state with JSON.stringify.
    const parsed: unknown = state === '' ? undefined : JSON.parse(state);
    if (!isRecord(parsed)) throw new ScriptHostErrors.ObjectCarriesNoState({ what });
    return parsed;
};

const headerOf = (value: unknown): HeaderState => {
    if (isRecord(value) && typeof value.key === 'string') {
        if (typeof value.value === 'string') return { key: value.key, value: value.value };
        if (typeof value.secret === 'string') return { key: value.key, secret: value.secret };
    }
    throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'HTTP header' });
};

const requestOf = (value: unknown): RequestState => {
    if (
        !isRecord(value) ||
        typeof value.uri !== 'string' ||
        !isMethod(value.method) ||
        typeof value.body !== 'string' ||
        !Array.isArray(value.headers) ||
        typeof value.timeout !== 'number'
    ) {
        throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'HTTP request' });
    }
    return {
        uri: value.uri,
        method: value.method,
        body: value.body,
        headers: value.headers.map(headerOf),
        timeout: value.timeout
    };
};

/** The state of an `HttpRequest` the host or a script made. */
const requestState = (state: string): RequestState => requestOf(parseState(state, 'HTTP request'));

/**
 * The scheme of a URI, as BDS reads it for its `MalformedUriError`: what comes before the first
 * `:`, when no `/`, `?` or `#` comes first, or nothing.
 */
const schemeOf = (uri: string): string => /^([^:/?#]+):/.exec(uri)?.[1] ?? '';

/** The request the network gets: each secret's text in its header, and no body for a `Get` or `Head`. */
const forNetwork = (request: RequestState): ScriptHttpRequest => ({
    uri: request.uri,
    method: request.method,
    headers: request.headers.map((header) => [header.key, 'secret' in header ? header.secret : header.value] as const),
    body: request.method === 'Get' || request.method === 'Head' ? '' : request.body,
    timeout: request.timeout
});

/**
 * BDS's message for a request the network ended with an error: the code as an unsigned
 * hexadecimal number, and as a signed one.
 */
const internalError = (code: number): ScriptApiError => {
    const hex = `0x${(code >>> 0).toString(16)}`;
    return new ScriptApiError(
        SERVER_NET,
        'InternalHttpRequestError',
        `Internal HTTP error occurred with message '${hex}' and code ${code}.`,
        { errorCode: code, errorMessage: hex }
    );
};

/** What one pack's `@minecraft/server-net` reaches of the runtime and the world. */
export interface NetPackHost {
    readonly engine: ScriptEngine;
    /** The pack's lists of request headers. */
    readonly lists: PackNet;
    /** Makes an instance of a class of a module the pack declares, which the caller frees or releases. */
    create(module: string, className: string, tag: number, state: string): ScriptHandle;
    /** Makes a promise in the pack's realm. */
    deferred(): ScriptDeferred;
    /** Makes an error object of the API's in the pack's realm, which the caller frees. */
    makeError(error: ScriptApiError): ScriptHandle;
    /** Sends a request over the world's network. */
    send(request: ScriptHttpRequest, settlement: HttpSettlement): void;
    /** Rejects every request the pack has in flight with `reason`. */
    cancelAll(reason: string): void;
}

/**
 * Registers the behavior of one pack's `@minecraft/server-net` on its implementations.
 * @param implementations - The pack's implementations, which `@minecraft/server`'s are on too.
 */
export const serverNetImplementations = (
    implementations: ScriptApiImplementations,
    host: NetPackHost
): ScriptApiImplementations => {
    const { engine } = host;

    /** New `HttpHeader`s, which the caller frees. */
    const makeHeaders = (headers: readonly HeaderState[]): ScriptHandle[] =>
        headers.map((header) => host.create(SERVER_NET, 'HttpHeader', NET_TAG.header, JSON.stringify(header)));
    /** A new list of new `HttpHeader`s, which the engine takes once the call returns it. */
    const headerList = (headers: readonly HeaderState[]): ScriptHandle => {
        const list = engine.evaluate('[]');
        if (!(list instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
        for (const [index, made] of makeHeaders(headers).entries()) {
            engine.set(list, String(index), made);
            engine.free(made);
        }
        return engine.release(list);
    };
    /**
     * Fills a request's one list of headers with new `HttpHeader`s and returns it, as BDS's
     * `headers` does ({@link PackNet}). The caller frees it.
     * @param exact - Whether elements a script added past the headers go.
     */
    const requestList = (call: ScriptCall, headers: readonly HeaderState[], exact: boolean): ScriptHandle => {
        const made = makeHeaders(headers);
        try {
            return host.lists.fill(call.self, made, exact);
        } finally {
            for (const handle of made) engine.free(handle);
        }
    };
    /** A header's value as a script reads it: its text, or a new `SecretString`. */
    const headerValue = (header: HeaderState): ScriptValue =>
        'secret' in header
            ? engine.release(host.create(SERVER_ADMIN, 'SecretString', ADMIN_TAG.secret, secretState(header.secret)))
            : header.value;
    /** A header from a key and a value the binding checked to be a string or a `SecretString`. */
    const makeHeader = (call: ScriptCall, key: ScriptValue, value: ScriptValue): HeaderState => {
        if (typeof value === 'string') return { key: String(key), value };
        const secret = secretText(call.stateOf(value));
        if (secret === undefined) {
            throw new ScriptHostErrors.ArgumentVariantConversionFailed({ argument: 1, type: 'SecretString | string' });
        }
        return { key: String(key), secret };
    };
    /** The headers of a list of `HttpHeader`s the binding checked. */
    const headersOf = (call: ScriptCall, value: ScriptValue): HeaderState[] => {
        if (!(value instanceof ScriptHandle)) return [];
        const length = Number(engine.get(value, 'length'));
        const headers: HeaderState[] = [];
        for (let index = 0; index < length; index++) {
            const header = engine.get(value, String(index));
            try {
                headers.push(headerOf(parseState(call.stateOf(header), 'HTTP header')));
            } finally {
                if (header instanceof ScriptHandle) engine.free(header);
            }
        }
        return headers;
    };
    /** A body: a string, as BDS converts neither an object nor anything else to `ISerializable`. */
    const bodyOf = (value: ScriptValue): string => {
        if (typeof value === 'string') return value;
        throw new ScriptHostErrors.ArgumentVariantConversionFailed({ argument: 0, type: 'string | ISerializable' });
    };
    /**
     * Changes a request's state and returns the request, for the builder methods. A change to its
     * headers fills its list again.
     */
    const change =
        (update: (request: RequestState, call: ScriptCall) => Partial<RequestState>) =>
        (call: ScriptCall): ScriptValue => {
            const request = requestState(call.state);
            const changed = update(request, call);
            call.setState(JSON.stringify({ ...request, ...changed }));
            if (changed.headers !== undefined) engine.free(requestList(call, changed.headers, true));
            return call.self;
        };
    /** A setter that changes one field of a request's state. */
    const set = (update: (request: RequestState, call: ScriptCall) => Partial<RequestState>) => (call: ScriptCall) => {
        change(update)(call);
    };

    /** Sends a request and returns its promise, which a later flush settles. */
    const send = (request: RequestState): ScriptValue => {
        const { promise, resolve, reject } = host.deferred();
        const rejectWith = (error: ScriptApiError): void => {
            const made = host.makeError(error);
            try {
                engine.call(reject, undefined, made);
            } finally {
                engine.free(made);
            }
        };
        const settlement: HttpSettlement = {
            respond: (result: ScriptHttpResult) => {
                if ('errorCode' in result) {
                    rejectWith(internalError(result.errorCode));
                    return;
                }
                const state: ResponseState = {
                    status: result.status,
                    body: result.body,
                    headers: result.headers,
                    request
                };
                const response = host.create(SERVER_NET, 'HttpResponse', NET_TAG.response, JSON.stringify(state));
                try {
                    engine.call(resolve, undefined, response);
                } finally {
                    engine.free(response);
                }
            },
            cancel: (reason) => rejectWith(plainError(reason)),
            release: () => {
                engine.free(resolve);
                engine.free(reject);
            }
        };
        const scheme = schemeOf(request.uri);
        if (scheme.toLowerCase() === 'http' || scheme.toLowerCase() === 'https') {
            host.send(forNetwork(request), settlement);
        } else {
            try {
                rejectWith(
                    new ScriptApiError(
                        SERVER_NET,
                        'MalformedUriError',
                        `Supported URI schemes are 'https' and 'http', the value '${scheme}' provided is invalid.`
                    )
                );
            } finally {
                settlement.release();
            }
        }
        return engine.release(promise);
    };

    const responseOf = (call: ScriptCall): ResponseState => {
        const parsed = parseState(call.state, 'HTTP response');
        const { status, body, headers } = parsed;
        if (typeof status !== 'number' || typeof body !== 'string' || !Array.isArray(headers)) {
            throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'HTTP response' });
        }
        const pairs = headers.flatMap((pair: unknown): (readonly [string, string])[] =>
            Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string'
                ? [[pair[0], pair[1]]]
                : []
        );
        return { status, body, headers: pairs, request: requestOf(parsed.request) };
    };

    return implementations
        .implement(SERVER_NET, 'HttpClient', 'get', (call) => send(newRequest(String(call.args[0]))))
        .implement(SERVER_NET, 'HttpClient', 'request', (call) => send(requestState(call.stateOf(call.args[0]))))
        .implement(SERVER_NET, 'HttpClient', 'cancelAll', (call) => {
            host.cancelAll(String(call.args[0]));
            return undefined;
        })
        .implement(SERVER_NET, 'HttpRequest', 'constructor', (call) => JSON.stringify(newRequest(String(call.args[0]))))
        .implement(SERVER_NET, 'HttpRequest', 'uri', {
            get: (call) => requestState(call.state).uri,
            set: set((_, call) => ({ uri: String(call.args[0]) }))
        })
        .implement(SERVER_NET, 'HttpRequest', 'method', {
            get: (call) => requestState(call.state).method,
            set: set((request, call) => ({ method: isMethod(call.args[0]) ? call.args[0] : request.method }))
        })
        .implement(
            SERVER_NET,
            'HttpRequest',
            'body',
            {
                get: (call) => requestState(call.state).body,
                set: set((_, call) => ({ body: bodyOf(call.args[0]) }))
            },
            { converts: ['body'] }
        )
        .implement(SERVER_NET, 'HttpRequest', 'timeout', {
            get: (call) => requestState(call.state).timeout,
            set: set((_, call) => ({ timeout: Number(call.args[0]) }))
        })
        .implement(SERVER_NET, 'HttpRequest', 'headers', {
            get: (call) => engine.release(requestList(call, requestState(call.state).headers, false)),
            set: set((_, call) => ({ headers: headersOf(call, call.args[0]) }))
        })
        .implement(
            SERVER_NET,
            'HttpRequest',
            'addHeader',
            change((request, call) => ({
                headers: [...request.headers, makeHeader(call, call.args[0], call.args[1])]
            }))
        )
        .implement(
            SERVER_NET,
            'HttpRequest',
            'setHeaders',
            change((_, call) => ({ headers: headersOf(call, call.args[0]) }))
        )
        .implement(
            SERVER_NET,
            'HttpRequest',
            'setMethod',
            change((request, call) => ({ method: isMethod(call.args[0]) ? call.args[0] : request.method }))
        )
        .implement(
            SERVER_NET,
            'HttpRequest',
            'setBody',
            change((_, call) => ({ body: bodyOf(call.args[0]) })),
            { converts: ['body'] }
        )
        .implement(
            SERVER_NET,
            'HttpRequest',
            'setTimeout',
            change((_, call) => ({ timeout: Number(call.args[0]) }))
        )
        .implement(SERVER_NET, 'HttpHeader', 'constructor', (call) =>
            JSON.stringify(makeHeader(call, call.args[0], call.args[1]))
        )
        .implement(SERVER_NET, 'HttpHeader', 'key', {
            get: (call) => headerOf(parseState(call.state, 'HTTP header')).key,
            set: (call) => {
                const header = headerOf(parseState(call.state, 'HTTP header'));
                call.setState(JSON.stringify({ ...header, key: String(call.args[0]) }));
            }
        })
        .implement(SERVER_NET, 'HttpHeader', 'value', {
            get: (call) => headerValue(headerOf(parseState(call.state, 'HTTP header'))),
            set: (call) => {
                const { key } = headerOf(parseState(call.state, 'HTTP header'));
                call.setState(JSON.stringify(makeHeader(call, key, call.args[0])));
            }
        })
        .implement(SERVER_NET, 'HttpResponse', 'status', { get: (call) => responseOf(call).status })
        .implement(SERVER_NET, 'HttpResponse', 'body', { get: (call) => responseOf(call).body })
        .implement(SERVER_NET, 'HttpResponse', 'headers', {
            get: (call) => headerList(responseOf(call).headers.map(([key, value]) => ({ key, value })))
        })
        .implement(SERVER_NET, 'HttpResponse', 'request', {
            get: (call) =>
                engine.release(
                    host.create(SERVER_NET, 'HttpRequest', NET_TAG.request, JSON.stringify(responseOf(call).request))
                )
        });
};
