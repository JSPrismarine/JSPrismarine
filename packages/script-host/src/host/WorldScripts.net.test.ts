import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test.helper';
import { MemoryWorld } from '../testing/memoryWorld.test.helper';
import { readScriptConfig, readScriptPack } from './pack';
import { WorldScripts } from './WorldScripts';
import type { ScriptHttpChannel, ScriptHttpRequest, ScriptHttpResult, ScriptTransferTarget } from './world';

/**
 * A {@link MemoryWorld} whose HTTP channel records what the scripts send and hands back the
 * results a test queues, as the input step admits them, and which records each transfer.
 */
class NetWorld extends MemoryWorld implements ScriptHttpChannel {
    public readonly sent: { readonly id: number; readonly request: ScriptHttpRequest }[] = [];
    public readonly canceled: number[] = [];
    public readonly transfers: { readonly id: string; readonly target: ScriptTransferTarget }[] = [];
    public readonly http: ScriptHttpChannel = this;
    public readonly player = this.join('Alex');
    private readonly results: ScriptHttpResult[] = [];

    /** The network answers a request; the next flush takes it, as the input step admits it. */
    public answer(result: ScriptHttpResult): void {
        this.results.push(result);
    }
    public send(id: number, request: ScriptHttpRequest): void {
        this.sent.push({ id, request });
    }
    public cancel(id: number): void {
        this.canceled.push(id);
    }
    public takeResponses(): readonly ScriptHttpResult[] {
        return this.results.splice(0);
    }
    public transferPlayer(id: string, target: ScriptTransferTarget): void {
        this.transfers.push({ id, target });
    }
}

const MODULE_UUID = '6f5b8d1e-6f0e-4c62-9d1e-1c2b3a4d5e6f';

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Writes a pack declaring `@minecraft/server`, `server-net` and `server-admin`, and its `config/` folder. */
const writePack = (source: string) => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-net-'));
    directories.push(directory);
    const pack = join(directory, 'pack');
    mkdirSync(join(pack, 'scripts'), { recursive: true });
    writeFileSync(
        join(pack, 'manifest.json'),
        JSON.stringify({
            header: { name: 'net', uuid: 'f0a3c1d2-5b6e-4f70-8a9b-0c1d2e3f4a5b', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: MODULE_UUID, entry: 'scripts/main.js' }],
            dependencies: [
                { module_name: '@minecraft/server', version: '2.0.0' },
                { module_name: '@minecraft/server-net', version: '1.0.0-beta' },
                { module_name: '@minecraft/server-admin', version: '1.0.0-beta' }
            ]
        })
    );
    writeFileSync(join(pack, 'scripts', 'main.js'), source);
    const config = join(directory, 'config', MODULE_UUID);
    mkdirSync(config, { recursive: true });
    writeFileSync(
        join(config, 'permissions.json'),
        JSON.stringify({
            allowed_modules: ['@minecraft/server', '@minecraft/server-net', '@minecraft/server-admin']
        })
    );
    writeFileSync(
        join(config, 'variables.json'),
        JSON.stringify({ base: 'http://127.0.0.1:1', object: { b: 2, a: [1, { d: 4, c: 3 }] }, flag: false })
    );
    writeFileSync(join(config, 'secrets.json'), JSON.stringify({ token: 'hunter2', number: 3 }));
    const read = readScriptPack(pack);
    if (read === undefined) throw new Error('the pack has a script module');
    return { pack: read, config: join(directory, 'config') };
};

/** A script prelude: `log` writes a line the test reads back. */
const PRELUDE = `
import { system, world } from '@minecraft/server';
import { http, HttpHeader, HttpRequest, HttpRequestMethod } from '@minecraft/server-net';
import { SecretString, secrets, transferPlayer, variables } from '@minecraft/server-admin';
const log = (line) => console.warn(typeof line === 'string' ? line : JSON.stringify(line));
const settled = (promise) => promise.then(
    (response) => log({ status: response.status, body: response.body, headers: response.headers.map((h) => [h.key, h.value]), uri: response.request.uri }),
    (error) => log({ error: String(error), code: error.errorCode ?? null })
);
`;

describe.skipIf(!scriptHostAvailable())("WorldScripts's @minecraft/server-net and @minecraft/server-admin", () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const running: WorldScripts[] = [];
    afterEach(() => {
        for (const scripts of running.splice(0)) scripts.shutdown();
    });

    const start = (source: string) => {
        const world = new NetWorld();
        const lines: string[] = [];
        const warnings: string[] = [];
        const log = {
            info: () => {},
            warn: (line: string) => lines.push(line),
            error: (line: string) => lines.push(line)
        };
        const { pack, config } = writePack(PRELUDE + source);
        const scripts = new WorldScripts({
            library,
            world,
            packs: [pack],
            config: readScriptConfig(config, (warning) => warnings.push(warning)),
            betaApis: true,
            log,
            seed: 1n,
            server: TEST_SERVER
        });
        running.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        const printed = () => lines.map((line) => line.replace(/^\[Scripting\] /, ''));
        return { world, scripts, printed, warnings };
    };

    it('sends each request once and settles it only in the flush after the input step admits its result', () => {
        const { world, scripts, printed } = start(`
system.run(() => {
    settled(http.request(new HttpRequest(variables.get('base') + '/echo')
        .setMethod(HttpRequestMethod.Post)
        .setBody('payload')
        .addHeader('X-Token', secrets.get('token'))));
    settled(http.get(variables.get('base') + '/hello'));
});`);
        scripts.flush();
        expect(world.sent).toEqual([
            {
                id: 1,
                request: {
                    uri: 'http://127.0.0.1:1/echo',
                    method: 'Post',
                    headers: [['X-Token', 'hunter2']],
                    body: 'payload',
                    timeout: 0
                }
            },
            { id: 2, request: { uri: 'http://127.0.0.1:1/hello', method: 'Get', headers: [], body: '', timeout: 0 } }
        ]);
        scripts.flush();
        expect(printed()).toEqual([]);

        world.answer({ id: 2, status: 200, headers: [['content-type', 'text/plain']], body: 'hello' });
        scripts.flush();
        expect(printed()).toEqual([
            '{"status":200,"body":"hello","headers":[["content-type","text/plain"]],"uri":"http://127.0.0.1:1/hello"}'
        ]);
        world.answer({ id: 1, errorCode: 111 });
        scripts.flush();
        expect(printed()[1]).toBe(
            '{"error":"InternalHttpRequestError: Internal HTTP error occurred with message \'0x6f\' and code 111.","code":111}'
        );
        expect(world.sent).toHaveLength(2);
    });

    it('rejects a URI that is not http or https without reaching the network', () => {
        const { world, scripts, printed } = start(`
system.run(() => {
    settled(http.get('ftp://127.0.0.1/file'));
    settled(http.get('not a uri'));
});`);
        scripts.flush();
        expect(world.sent).toEqual([]);
        expect(printed()).toEqual([
            '{"error":"MalformedUriError: Supported URI schemes are \'https\' and \'http\', the value \'ftp\' provided is invalid.","code":null}',
            '{"error":"MalformedUriError: Supported URI schemes are \'https\' and \'http\', the value \'\' provided is invalid.","code":null}'
        ]);
    });

    it('rejects every request in flight on cancelAll, abandons it, and drops a result that comes after', () => {
        const { world, scripts, printed } = start(`
system.run(() => {
    settled(http.get('http://127.0.0.1:1/a'));
    settled(http.get('http://127.0.0.1:1/b'));
    http.cancelAll('stop');
    settled(http.get('http://127.0.0.1:1/c'));
});`);
        scripts.flush();
        expect(world.canceled).toEqual([1, 2]);
        expect(printed()).toEqual(['{"error":"Error: stop","code":null}', '{"error":"Error: stop","code":null}']);
        world.answer({ id: 1, status: 200, headers: [], body: 'late' });
        world.answer({ id: 3, status: 204, headers: [], body: '' });
        scripts.flush();
        expect(printed().slice(2)).toEqual(['{"status":204,"body":"","headers":[],"uri":"http://127.0.0.1:1/c"}']);
    });

    it('settles the same results the same way on a second run, as a replay admits the recorded ones', () => {
        const source = `
system.run(() => {
    for (const path of ['a', 'b', 'c']) settled(http.get('http://127.0.0.1:1/' + path));
});`;
        const run = () => {
            const { world, scripts, printed } = start(source);
            scripts.flush();
            world.answer({ id: 3, status: 500, headers: [], body: 'c' });
            scripts.flush();
            world.answer({ id: 1, status: 200, headers: [], body: 'a' });
            world.answer({ id: 2, errorCode: -2147467259 });
            scripts.flush();
            return printed();
        };
        const first = run();
        expect(first).toHaveLength(3);
        expect(run()).toEqual(first);
    });

    it('keeps one header list per request, filled again on each read, as BDS does', () => {
        const { scripts, printed } = start(`
system.run(() => {
    const request = new HttpRequest('http://x/').addHeader('X-A', 'a');
    const list = request.headers;
    log([request.headers === list, request.headers[0] === request.headers[0]]);
    request.headers.push(new HttpHeader('X-B', 'b'));
    request.headers[0].value = 'changed';
    log(request.headers.map((h) => [h.key, h.value]));
    request.addHeader('X-C', 'c');
    log([list.length, request.headers.map((h) => h.key)]);
    log(request.setHeaders([new HttpHeader('X-D', secrets.get('token'))]).headers.map((h) => [h.key, h.value instanceof SecretString]));
});`);
        scripts.flush();
        expect(printed()).toEqual(['[true,false]', '[["X-A","a"],["X-B","b"]]', '[2,["X-A","X-C"]]', '[["X-D",true]]']);
    });

    it("reads variables and secrets from the pack's config folder, and never shows a secret's text", () => {
        const { scripts, printed, warnings } = start(`
log([variables.get('object'), Object.keys(variables.get('object')), variables.get('flag'), variables.get('missing') === undefined]);
const token = secrets.get('token');
log([token instanceof SecretString, String(token), JSON.stringify(token), Object.keys(token), secrets.get('number') === undefined]);
log(secrets.get('token') === secrets.get('token'));
world.afterEvents.worldLoad.subscribe(() => log([variables.names, secrets.names]));
`);
        scripts.flush();
        expect(printed()).toEqual([
            '[{"a":[1,{"c":3,"d":4}],"b":2},["a","b"],false,true]',
            '[true,"[object Object]","{}",[],true]',
            'false',
            '[["base","object","flag"],["token"]]'
        ]);
        expect(warnings).toEqual([
            `Secret 'number' in file 'config/${MODULE_UUID}/secrets.json' is not a string. Secrets can only be strings.`
        ]);
    });

    it('transfers a player by address or NetherNet id, and refuses options that are neither', () => {
        const { world, scripts, printed } = start(`
const attempt = (call) => { try { call(); log('ok'); } catch (error) { log(String(error)); } };
system.run(() => {
    const player = world.getAllPlayers()[0];
    attempt(() => transferPlayer(player, { hostname: 'example.test', port: 19133 }));
    attempt(() => transferPlayer(player, { netherNetId: '42' }));
    attempt(() => transferPlayer(player, { hostname: 'example.test', port: 70000 }));
    attempt(() => transferPlayer(player, {}));
    attempt(() => transferPlayer(undefined, { netherNetId: '42' }));
});`);
        scripts.flush();
        const refused =
            'TypeError: Native variant type conversion failed. Function argument [1] expected type: TransferPlayerIpPortOptions | TransferPlayerNetherNetOptions';
        expect(printed()).toEqual([
            'ok',
            'ok',
            refused,
            refused,
            'InvalidArgumentError: Invalid type passed to argument [0]. Expected type: Player'
        ]);
        expect(world.transfers).toEqual([
            { id: world.player, target: { hostname: 'example.test', port: 19133 } },
            { id: world.player, target: { netherNetId: '42' } }
        ]);
    });
});
