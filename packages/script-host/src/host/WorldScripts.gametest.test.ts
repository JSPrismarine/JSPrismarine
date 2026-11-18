import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test.helper';
import { MemoryWorld } from '../testing/memoryWorld.test.helper';
import { readScriptConfig, readScriptPack } from './pack';
import type { ScriptPack } from './pack';
import { WorldScripts } from './WorldScripts';

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/**
 * Writes a beta pack that declares `@minecraft/server-gametest`, with `structures/jsp/air.mcstructure`.
 * `print(event, value)` logs `<tick> <event> <value>`, the tick counted from the first test's start.
 */
const writePack = (body: string): ScriptPack => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-gametest-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    mkdirSync(join(directory, 'structures', 'jsp'), { recursive: true });
    writeFileSync(join(directory, 'structures', 'jsp', 'air.mcstructure'), new Uint8Array(12));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name: 'gametests', uuid: 'aac52733-889b-4c87-abcb-f064ea7735a2', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: '13f251b3-41c9-4271-b2d1-d4abde28890b', entry: 'scripts/main.js' }],
            dependencies: [
                { module_name: '@minecraft/server', version: '2.11.0-beta' },
                { module_name: '@minecraft/server-gametest', version: '1.0.0-beta' }
            ]
        })
    );
    writeFileSync(
        join(directory, 'scripts', 'main.js'),
        `import { Player, system, world } from '@minecraft/server';
        import * as gametest from '@minecraft/server-gametest';
        let start;
        const print = (event, value) =>
            console.warn([start === undefined ? '-' : system.currentTick - start, event, value].filter((part) => part !== undefined).join(' '));
        const attempt = (event, call) => {
            try { print(event, JSON.stringify(call())); } catch (error) { print(event, String(error)); }
        };
        const air = (name, run) => gametest.register('jsp', name, (test) => {
            if (start === undefined) start = system.currentTick;
            print(name + ' started');
            run(test);
        }).structureName('jsp:air').structureLocation({ x: 0, y: -60, z: 0 }).maxTicks(20).tag('jsp');
        ${body}`
    );
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error('the pack has a script module');
    return pack;
};

describe.skipIf(!scriptHostAvailable())('WorldScripts GameTests', () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const runtimes: WorldScripts[] = [];
    afterEach(() => {
        for (const runtime of runtimes.splice(0)) runtime.shutdown();
    });

    /** Starts a runtime over `pack`, runs `/gametest runset jsp`, and flushes `ticks` ticks. */
    const run = (pack: ScriptPack, ticks: number, world = new MemoryWorld()) => {
        const lines: string[] = [];
        const log = {
            info: (line: string) => lines.push(line),
            warn: (line: string) => lines.push(line.replace('[Scripting] ', '')),
            error: (line: string) => lines.push(line)
        };
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs: [pack],
            config: readScriptConfig(undefined),
            betaApis: true,
            log,
            seed: 1n
        });
        runtimes.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        const reply = scripts.gametest({ kind: 'runset', tag: 'jsp' });
        for (let tick = 0; tick < ticks; tick++) scripts.flush();
        return { lines, reply, world, scripts };
    };

    it('ends a test on succeed and fail at once, and refuses its members once it has ended', () => {
        const { lines, reply } = run(
            writePack(`
                air('succeeds', (test) => {
                    test.runAfterDelay(2, () => print('never'));
                    attempt('succeed', () => test.succeed());
                    attempt('isCompleted', () => test.isCompleted());
                    attempt('succeed again', () => test.succeed());
                    system.runTimeout(() => attempt('next tick', () => test.isCompleted()), 1);
                });
                air('fails', (test) => {
                    attempt('fail', () => test.fail('boom'));
                    attempt('isCompleted', () => test.isCompleted());
                });`),
            4
        );

        expect(reply.ok).toBe(true);
        expect(lines.filter((line) => !line.startsWith('[Scripting] [gametests] uses'))).toEqual([
            'onTestStructureLoaded: jsp:succeeds',
            'onTestStructureLoaded: jsp:fails',
            'Running test batch (2 tests)...',
            '0 succeeds started',
            'onTestPassed: jsp:succeeds',
            '0 succeed',
            '0 isCompleted true',
            '0 succeed again GameTestCompletedError: GameTest jsp:succeeds has already completed and can no longer access method: succeed',
            '0 fails started',
            'onTestFailed: jsp:fails - boom',
            '0 fail',
            '0 isCompleted true',
            '1 next tick ReferenceError: Native function [Test::isCompleted] object bound to prototype does not exist.'
        ]);
    });

    it('runs delays, idle and succeedWhen on the ticks counted from the start, and fails a test out of ticks', () => {
        const { lines } = run(
            writePack(`
                air('times_out', (test) => {
                    test.runAfterDelay(2, () => print('delay 2'));
                    test.runAfterDelay(10, () => print('delay 10'));
                }).maxTicks(5);
                air('succeeds_when', (test) => {
                    let calls = 0;
                    test.succeedWhen(() => {
                        calls += 1;
                        print('check', calls);
                        test.assert(calls >= 3, 'not yet');
                    });
                });
                air('idles', (test) => test.idle(3).then(() => { print('idle resolved'); test.succeed(); }));
                air('asserts', (test) => {
                    attempt('assert', () => test.assert(false, 'nope'));
                    test.succeed();
                });`),
            8
        );

        expect(
            lines.filter(
                (line) => /^\d/.test(line) || line.startsWith('onTestPassed') || line.startsWith('onTestFailed')
            )
        ).toEqual([
            '0 times_out started',
            '0 succeeds_when started',
            '0 check 1',
            '0 idles started',
            '0 asserts started',
            '0 assert GameTestError: nope',
            'onTestPassed: jsp:asserts',
            '1 check 2',
            '2 delay 2',
            '2 check 3',
            'onTestPassed: jsp:succeeds_when',
            '3 idle resolved',
            'onTestPassed: jsp:idles',
            "onTestFailed: jsp:times_out - Didn't succeed or fail within 5 ticks"
        ]);
    });

    it('fails a test whose function throws, or whose structure file is missing, without failing the others', () => {
        const { lines } = run(
            writePack(`
                air('throws', () => { throw new Error('thrown'); });
                air('missing', (test) => test.succeed()).structureName('jsp:missing');`),
            2
        );

        expect(lines.filter((line) => line.startsWith('onTest'))).toEqual([
            'onTestStructureLoaded: jsp:throws',
            "onTestFailed: jsp:missing - Failed to spawn test structure with path 'structures/jsp/missing.mcstructure' ",
            expect.stringMatching(/^onTestFailed: jsp:throws - Error: thrown/)
        ]);
    });

    it('starts a named batch first and the next batch four ticks after the last one ended', () => {
        const { lines } = run(
            writePack(`
                air('first', (test) => test.succeed());
                air('second', (test) => test.succeed()).batch('early');`),
            6
        );

        expect(lines.filter((line) => line.includes('started'))).toEqual(['0 second started', '4 first started']);
    });

    it('answers /gametest with what it ran, and refuses a tag no test has', () => {
        const { scripts } = run(writePack(`air('one', (test) => test.succeed());`), 0);

        expect(scripts.gametest({ kind: 'runset' })).toEqual({
            ok: false,
            message: "No tests found for tag 'suite:default'"
        });
        expect(scripts.gametest({ kind: 'run', name: 'jsp:one' }).ok).toBe(true);
        expect(scripts.gametest({ kind: 'run', name: 'jsp:none' }).ok).toBe(false);
    });

    it('spawns a simulated player who is a Player, whose chat raises chatSend, and who leaves when the test ends', () => {
        const { lines, world } = run(
            writePack(`
                world.beforeEvents.chatSend.subscribe((event) => print('before', event.message + ' ' + event.sender.name));
                world.afterEvents.chatSend.subscribe((event) => print('after', event.message));
                world.afterEvents.playerJoin.subscribe((event) => print('join', event.playerName));
                air('chats', (test) => {
                    const player = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, 'Chatter');
                    attempt('instances', () => [player instanceof Player, player instanceof gametest.SimulatedPlayer]);
                    attempt('same object', () => world.getAllPlayers()[0] === player);
                    attempt('location', () => player.location);
                    print('chat');
                    player.chat('hello');
                    attempt('jump', () => player.jump());
                    player.move(1, 0);
                    test.succeed();
                    system.runTimeout(() => attempt('later', () => [player.isValid, world.getAllPlayers().length]), 2);
                });`),
            4
        );

        expect(lines.filter((line) => /^\d/.test(line))).toEqual([
            '0 chats started',
            '0 instances [true,true]',
            '0 same object true',
            '0 location {"x":1.5,"y":-58,"z":1.5}',
            '0 chat',
            '0 before hello Chatter',
            '0 jump true',
            '0 join Chatter',
            '0 after hello',
            '2 later [false,0]'
        ]);
        expect(world.acted).toEqual(['1 chat', '1 jump', '1 move']);
        expect(world.placedStructures).toEqual(['minecraft:overworld 0 -60 0 12']);
        expect(world.simulatedTicks).toBe(4);
    });
});
