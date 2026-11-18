/**
 * The `http` pack of the `net-http` scenario: `HttpRequest` and `HttpHeader` as a script builds
 * them, and what `http.get`, `http.request` and `http.cancelAll` settle with against the local
 * HTTP server the scenario runner starts (`packages/parity/src/scripting/httpServer.ts`). The
 * server's address is the `base` variable of the pack's `variables.json`.
 *
 * A response arrives in whatever tick the network delivers it, so the pack records every outcome
 * together, in the order it sent the requests, at a tick it fixes itself.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';
import { http, HttpHeader, HttpRequest, HttpRequestMethod } from '@minecraft/server-net';
import { secrets, variables } from '@minecraft/server-admin';

const PACK = 'http';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** A header as plain data, with a secret's value reported by its type. */
const header = (each) => [each.key, typeof each.value === 'string' ? each.value : `[${each.value?.constructor?.name}]`];

/** A request as plain data. */
const describe = (request) => ({
    uri: request.uri,
    method: request.method,
    body: request.body,
    headers: request.headers.map(header),
    timeout: request.timeout
});

const base = variables.get('base');

/** What a script builds with `HttpRequest` and `HttpHeader`, outside early execution. */
const probeBuilders = () => {
    attempt('a new request', () => describe(new HttpRequest(`${base}/hello`)));
    attempt('the setters return the request', () => {
        const request = new HttpRequest(`${base}/hello`);
        return [
            request.setMethod(HttpRequestMethod.Post) === request,
            request.setBody('text') === request,
            request.setTimeout(7) === request,
            request.addHeader('X-One', '1') === request,
            request.setHeaders([new HttpHeader('X-Two', '2')]) === request
        ];
    });
    attempt('a request after the setters', () => {
        const request = new HttpRequest(`${base}/hello`)
            .setMethod(HttpRequestMethod.Put)
            .setBody('payload')
            .setTimeout(3)
            .addHeader('X-One', '1')
            .addHeader('X-One', 'again');
        return describe(request);
    });
    attempt('setHeaders replaces the headers', () =>
        describe(new HttpRequest('u').addHeader('X-Old', 'o').setHeaders([new HttpHeader('X-New', 'n')]))
    );
    attempt('the properties are writable', () => {
        const request = new HttpRequest('first');
        request.uri = 'second';
        request.method = HttpRequestMethod.Delete;
        request.body = 'written';
        request.timeout = 9;
        request.headers = [new HttpHeader('X-Set', 'yes')];
        return describe(request);
    });
    attempt('headers is a copy', () => {
        const request = new HttpRequest('u').addHeader('X-A', 'a');
        request.headers.push(new HttpHeader('X-B', 'b'));
        request.headers[0].value = 'changed';
        return request.headers.map(header);
    });
    attempt('headers gives the same list each time', () => {
        const request = new HttpRequest('u').addHeader('X-A', 'a');
        return [request.headers === request.headers, request.headers[0] === request.headers[0]];
    });
    attempt('a list read before addHeader', () => {
        const request = new HttpRequest('u').addHeader('X-A', 'a');
        const list = request.headers;
        request.addHeader('X-B', 'b');
        return [list.length, request.headers.length];
    });
    attempt('a header value is writable', () => {
        const made = new HttpHeader('X-Key', 'value');
        made.value = 'written';
        return header(made);
    });
    attempt('a header changed after addHeader', () => {
        const made = new HttpHeader('X-Key', 'value');
        const request = new HttpRequest('u').setHeaders([made]);
        made.value = 'later';
        return request.headers.map(header);
    });
    attempt('a header', () => {
        const made = new HttpHeader('X-Key', 'value');
        made.key = 'X-Renamed';
        return header(made);
    });
    attempt('a header holding a secret', () => header(new HttpHeader('X-Secret', secrets.get('token'))));
    attempt('a request header holding a secret', () =>
        describe(new HttpRequest('u').addHeader('Authorization', secrets.get('token')))
    );
    attempt('a negative timeout', () => new HttpRequest('u').setTimeout(-1).timeout);
    attempt('a method out of the enum', () => new HttpRequest('u').setMethod('Trace').method);
    attempt('a body that is an object', () => new HttpRequest('u').setBody({ a: 1 }).body);
};

/** Every request the pack sends, in the order it sends them, and how each one settled. */
const outcomes = [];

/** Sends one request and keeps how it settles. A call that throws at once is kept too. */
const send = (label, call) => {
    const outcome = { label };
    outcomes.push(outcome);
    let promise;
    try {
        promise = call();
    } catch (error) {
        outcome.thrown = String(error);
        return;
    }
    outcome.promise = promise instanceof Promise;
    promise.then(
        (response) => {
            outcome.status = response.status;
            outcome.body = response.body;
            outcome.headers = response.headers.map(header).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
            outcome.request = describe(response.request);
        },
        (error) => {
            outcome.rejected = String(error);
            outcome.rejectedWith = error?.constructor?.name;
        }
    );
};

attempt('typeof http.get', () => typeof http.get);
attempt('new HttpRequest in early execution', () => new HttpRequest(`${base}/hello`).uri);
send('get at the top level', () => http.get(`${base}/hello`));

world.afterEvents.worldLoad.subscribe(() => {
    record('worldLoad');
    probeBuilders();
    send('get', () => http.get(`${base}/hello`));
    send('post with headers and a body', () =>
        http.request(
            new HttpRequest(`${base}/echo`)
                .setMethod(HttpRequestMethod.Post)
                .setBody('{"a":1}')
                .addHeader('Content-Type', 'application/json')
                .addHeader('X-Token', secrets.get('token'))
        )
    );
    for (const method of ['Get', 'Head', 'Put', 'Patch', 'Delete']) {
        send(`echo ${method}`, () =>
            http.request(new HttpRequest(`${base}/echo`).setMethod(HttpRequestMethod[method]).setBody('m'))
        );
    }
    send('status 404', () => http.get(`${base}/status/404`));
    send('status 500', () => http.get(`${base}/status/500`));
    send('a redirect', () => http.get(`${base}/redirect`));
    send('a closed port', () => http.get('http://127.0.0.1:1/closed'));
    send('not a uri', () => http.get('not a uri'));
    send('an empty uri', () => http.get(''));
    send('another scheme', () => http.get('ftp://127.0.0.1/file'));
    send('a timeout of one second', () => http.request(new HttpRequest(`${base}/slow`).setTimeout(1)));

    // Long after every request above has settled, or timed out.
    system.runTimeout(() => {
        send('canceled', () => http.request(new HttpRequest(`${base}/slow`)));
        attempt('cancelAll', () => http.cancelAll('stopped by the scenario'));
        send('after cancelAll', () => http.get(`${base}/hello`));
    }, 60);

    system.runTimeout(() => {
        for (const { label, promise: _promise, ...outcome } of outcomes)
            record(`outcome: ${label}`, { value: outcome });
        attempt('every send returned a promise', () => outcomes.map((each) => each.promise ?? null));
        console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
    }, 120);
});
