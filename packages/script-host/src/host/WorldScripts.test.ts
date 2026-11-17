import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable } from '../testing/library.test.helper';
import type { ScriptPack } from './pack';
import { readScriptConfig, readScriptPack } from './pack';
import type { CriticalException, WatchdogSettings } from './WorldScripts';
import { WorldScripts } from './WorldScripts';
import type { ScriptValue } from '../values';
import type { ChatSendIntent, Guard, ScriptWeather, ScriptWorld, ScriptWorldEvent, WeatherChangeIntent } from './world';

/** A world in memory: one weather, its guards, and the messages it was sent. */
class FakeWorld implements ScriptWorld {
    public now = 1_800_000_000_000;
    public readonly messages: string[] = [];
    /** The chat lines the guards let through. */
    public readonly chats: string[] = [];
    public online: readonly string[] = [];
    private current: ScriptWeather = 'Clear';
    private readonly guards: Guard<WeatherChangeIntent>[] = [];
    private readonly chatGuards: Guard<ChatSendIntent>[] = [];
    private readonly committed: ScriptWorldEvent[] = [];

    public dimensions(): readonly string[] {
        return ['minecraft:overworld', 'minecraft:nether', 'minecraft:the_end'];
    }
    public players(): readonly string[] {
        return this.online;
    }
    /** A player types a line of chat. */
    public chat(sender: string, message: string): void {
        for (const guard of this.chatGuards) if (guard({ sender, message }).veto) return;
        this.chats.push(`${sender}: ${message}`);
    }
    public guardChat(guard: Guard<ChatSendIntent>): () => void {
        this.chatGuards.push(guard);
        return () => this.chatGuards.splice(this.chatGuards.indexOf(guard), 1);
    }
    public sendMessage(message: string): void {
        this.messages.push(message);
    }
    public weather(): ScriptWeather {
        return this.current;
    }
    public setWeather(dimension: string, weather: ScriptWeather, duration: number): void {
        let intent: WeatherChangeIntent = { dimension, previousWeather: this.current, newWeather: weather, duration };
        for (const guard of this.guards) {
            const verdict = guard(intent);
            if (verdict.veto) return;
            intent = verdict.intent;
        }
        this.committed.push({
            type: 'weatherChange',
            dimension,
            previousWeather: this.current,
            newWeather: intent.newWeather
        });
        this.current = intent.newWeather;
    }
    public guardWeather(guard: Guard<WeatherChangeIntent>): () => void {
        this.guards.push(guard);
        return () => this.guards.splice(this.guards.indexOf(guard), 1);
    }
    public takeEvents(): readonly ScriptWorldEvent[] {
        return this.committed.splice(0);
    }
    public clock(): number {
        return this.now;
    }
}

/** What a runtime wrote to the content log, by level. */
class Log {
    public readonly lines: string[] = [];
    public info(message: string): void {
        this.lines.push(`info ${message}`);
    }
    public warn(message: string): void {
        this.lines.push(`warn ${message}`);
    }
    public error(message: string): void {
        this.lines.push(`error ${message}`);
    }
    /** What the scripts printed with `console.warn`, without the prefix. */
    public printed(): string[] {
        return this.lines.filter((line) => line.startsWith('warn [Scripting] ')).map((line) => line.slice(17));
    }
}

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Writes a pack whose entry is `source`, declaring `@minecraft/server` at `version`. */
const writePack = (
    source: string,
    version = '2.0.0',
    name = 'probe',
    moduleUuid = '13f251b3-41c9-4271-b2d1-d4abde28890b'
): ScriptPack => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-scripts-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name, uuid: 'aac52733-889b-4c87-abcb-f064ea7735a2', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: moduleUuid, entry: 'scripts/main.js' }],
            dependencies: [{ module_name: '@minecraft/server', version }]
        })
    );
    writeFileSync(join(directory, 'scripts', 'main.js'), source);
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error('the pack has a script module');
    return pack;
};

describe.skipIf(!scriptHostAvailable())('WorldScripts', () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const runtimes: WorldScripts[] = [];
    afterEach(() => {
        for (const runtime of runtimes.splice(0)) runtime.shutdown();
    });

    const start = (
        packs: readonly ScriptPack[],
        options: {
            world?: FakeWorld;
            seed?: bigint;
            watchdog?: WatchdogSettings;
            critical?: CriticalException[];
            betaApis?: boolean;
        } = {}
    ) => {
        const world = options.world ?? new FakeWorld();
        const log = new Log();
        const scripts = new WorldScripts({
            library,
            world,
            packs,
            config: readScriptConfig(undefined),
            log,
            seed: options.seed ?? 1n,
            ...(options.watchdog === undefined ? {} : { watchdog: options.watchdog }),
            ...(options.betaApis === undefined ? {} : { betaApis: options.betaApis }),
            onShutdown: (reason) => options.critical?.push(reason)
        });
        runtimes.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        return { scripts, world, log };
    };

    it('costs one host call for each system.run a script makes', () => {
        const { scripts } = start([
            writePack(`import { system, world } from '@minecraft/server';
                const queue = (count) => { for (let i = 0; i < count; i++) system.run(() => {}); };
                world.afterEvents.worldLoad.subscribe(() => queue(100));
                system.runTimeout(() => queue(1), 1);`)
        ]);
        const before = scripts.stats().hostCalls;
        scripts.flush();
        const afterWorldLoad = scripts.stats().hostCalls;
        scripts.flush();
        // Tick 0 runs the 100 calls, tick 1 the one; the callbacks they queue call nothing.
        expect(afterWorldLoad - before).toBe(100);
        expect(scripts.stats().hostCalls - afterWorldLoad).toBe(1);
    });

    it('stops a callback that never returns at its step budget, at the same step every run', () => {
        const source = `import { system } from '@minecraft/server';
            system.runTimeout(() => { try { while (true) {} } catch { console.warn('caught'); } finally { console.warn('finally'); } }, 1);
            system.runTimeout(() => console.warn('next task'), 2);`;
        const steps: number[] = [];
        for (let run = 0; run < 2; run++) {
            const critical: CriticalException[] = [];
            const { scripts, log } = start([writePack(source)], {
                watchdog: { hangSteps: 40, shutdown: false },
                critical
            });
            for (let tick = 0; tick < 3; tick++) scripts.flush();
            steps.push(scripts.stats().steps);
            expect(log.printed()).toEqual(['next task']);
            expect(log.lines).toContain(
                "error [Scripting] [Watchdog] Unhandled critical exception of type 'Hang' in behavior pack 'probe'"
            );
            expect(critical).toEqual([]);
        }
        expect(steps[0]).toBeGreaterThan(40);
        expect(steps[1]).toBe(steps[0]);
    });

    it('asks for a shutdown after a hang or a caught stack overflow while the watchdog says to', () => {
        const critical: CriticalException[] = [];
        const { scripts } = start(
            [
                writePack(`import { system } from '@minecraft/server';
                system.run(() => { const recurse = () => recurse() + 1; try { recurse(); } catch {} });`)
            ],
            { watchdog: { hangSteps: 1000, shutdown: true }, critical }
        );
        scripts.flush();
        expect(critical).toEqual(['StackOverflow']);
    });

    it('draws Math.random from the world seed, the same numbers for the same seed', () => {
        const draws = (seed: bigint): string[] => {
            const { scripts, log } = start(
                [
                    writePack(
                        `import { system } from '@minecraft/server'; system.run(() => console.warn([Math.random(), Math.random()].join()));`
                    )
                ],
                { seed }
            );
            scripts.flush();
            return log.printed();
        };
        const first = draws(42n);
        expect(draws(42n)).toEqual(first);
        expect(draws(43n)).not.toEqual(first);
        for (const value of (first[0] ?? '').split(',').map(Number)) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('gives Date the clock the world admitted for the tick, not the host’s', () => {
        const world = new FakeWorld();
        const { scripts, log } = start(
            [
                writePack(
                    `import { system } from '@minecraft/server'; system.runInterval(() => console.warn(Date.now(), new Date().getTime(), Date().length > 0), 1);`
                )
            ],
            { world }
        );
        world.now = 1000;
        scripts.flush();
        scripts.flush();
        world.now = 2000;
        scripts.flush();
        expect(log.printed()).toEqual(['1000 1000 true', '2000 2000 true']);
    });

    it('sends system.beforeEvents.watchdogTerminate before a shutdown, which a cancel stops', () => {
        const source = `import { system } from '@minecraft/server';
            system.beforeEvents.watchdogTerminate.subscribe((event) => {
                console.warn('terminate', event.terminateReason);
                event.cancel = true;
            });
            system.runTimeout(() => { while (true) {} }, 1);
            system.runTimeout(() => { const recurse = () => recurse() + 1; try { recurse(); } catch {} }, 2);
            system.runTimeout(() => console.warn('still running'), 3);`;
        const critical: CriticalException[] = [];
        const { scripts, log } = start([writePack(source, '2.11.0-beta')], {
            watchdog: { hangSteps: 40, shutdown: true },
            critical,
            betaApis: true
        });
        for (let tick = 0; tick < 4; tick++) scripts.flush();

        expect(log.printed()).toEqual(['terminate Hang', 'terminate StackOverflow', 'still running']);
        expect(critical).toEqual([]);
        expect(log.lines.filter((line) => line.includes('Unhandled critical exception'))).toEqual([]);
    });

    it('shuts down after a watchdogTerminate no script cancels', () => {
        const source = `import { system } from '@minecraft/server';
            system.beforeEvents.watchdogTerminate.subscribe((event) => console.warn('terminate', event.terminateReason));
            system.runTimeout(() => { while (true) {} }, 1);`;
        const critical: CriticalException[] = [];
        const { scripts, log } = start([writePack(source, '2.11.0-beta')], {
            watchdog: { hangSteps: 40, shutdown: true },
            critical,
            betaApis: true
        });
        for (let tick = 0; tick < 3; tick++) scripts.flush();

        expect(log.printed()).toEqual(['terminate Hang']);
        expect(critical).toEqual(['Hang']);
    });

    it("lets world.beforeEvents.chatSend cancel a player's chat, in restricted execution", () => {
        const world = new FakeWorld();
        world.online = ['7', '9'];
        const { log } = start(
            [
                writePack(
                    `import { Player, world } from '@minecraft/server';
                    world.beforeEvents.chatSend.subscribe((event) => {
                        console.warn(event.message, event.sender instanceof Player, event.sender === world.getAllPlayers()[1]);
                        try { world.playMusic('record.cat'); } catch (error) { console.warn(String(error)); }
                        if (event.message === 'cancel me') event.cancel = true;
                    });`,
                    '2.11.0-beta'
                )
            ],
            { world, betaApis: true }
        );

        world.chat('9', 'hello');
        world.chat('9', 'cancel me');

        expect(world.chats).toEqual(['9: hello']);
        const restricted = 'ReferenceError: Native function [World::playMusic] cannot be used in restricted execution.';
        expect(log.printed()).toEqual(['hello true true', restricted, 'cancel me true true', restricted]);
    });

    it('lets a before-event veto or change the world’s action, and sends the after-event in the flush', () => {
        const world = new FakeWorld();
        const { scripts, log } = start(
            [
                writePack(`import { system, world, WeatherType } from '@minecraft/server';
                world.beforeEvents.weatherChange.subscribe((event) => {
                    if (event.newWeather === WeatherType.Thunder) event.cancel = true;
                    if (event.newWeather === WeatherType.Clear) event.newWeather = WeatherType.Rain;
                });
                world.afterEvents.weatherChange.subscribe((event) => console.warn('after', event.dimension, event.previousWeather, event.newWeather));
                system.run(() => { const overworld = world.getDimension('overworld'); overworld.setWeather(WeatherType.Thunder); console.warn('weather', world.getDimension('minecraft:overworld').id); });
                system.runTimeout(() => world.getDimension('overworld').setWeather(WeatherType.Clear, 100), 1);`)
            ],
            { world }
        );
        scripts.flush();
        expect(world.weather()).toBe('Clear');
        scripts.flush();
        expect(world.weather()).toBe('Rain');
        expect(log.printed()).toEqual(['weather minecraft:overworld', 'after overworld Clear Rain']);
    });

    it('reloads every pack: shutdown first, then the top level, startup and worldLoad again, at the current tick', () => {
        const { scripts, log } = start([
            writePack(`import { system, world } from '@minecraft/server';
                console.warn('top level', system.currentTick);
                system.beforeEvents.startup.subscribe(() => console.warn('startup'));
                system.beforeEvents.shutdown.subscribe(() => console.warn('shutdown'));
                world.afterEvents.worldLoad.subscribe(() => console.warn('worldLoad', system.currentTick));
                system.runInterval(() => {}, 1);`)
        ]);
        for (let tick = 0; tick < 3; tick++) scripts.flush();
        scripts.reload();
        scripts.flush();
        expect(log.printed()).toEqual([
            'top level 0',
            'startup',
            'worldLoad 0',
            'shutdown',
            'top level 3',
            'startup',
            'worldLoad 3'
        ]);
        expect(scripts.currentTick).toBe(4);
    });

    it('prints how much of what a pack uses is implemented when it loads', () => {
        const { log } = start([
            writePack(
                `import { system, world } from '@minecraft/server'; system.run(() => world.getAllPlayers()); world.setDefaultSpawnLocation;`
            )
        ]);
        const coverage = log.lines.find((line) => line.includes('Script API members'));
        expect(coverage).toMatch(
            /^info \[Scripting\] \[probe\] uses 3 Script API members, 2 of them implemented \(@minecraft\/server 2\.10\.0: \d+ of \d+/
        );
        expect(log.lines).toContain('info [Scripting] [probe] not implemented yet: setDefaultSpawnLocation');
    });

    it("binds each pack's API in the pack's own context, so its errors and objects are of that context", () => {
        const { log } = start([
            writePack(`import { system, world } from '@minecraft/server';
                Object.getPrototypeOf(Object.getPrototypeOf(world)).pollutedByFirst = true;
                try { system.run(42); } catch (error) { console.warn('first', error instanceof TypeError, error instanceof Error); }`),
            writePack(
                `import { world } from '@minecraft/server';
                console.warn('second', 'pollutedByFirst' in world);`,
                '2.0.0',
                'second'
            )
        ]);
        expect(log.printed()).toEqual(['first true true', 'second false']);
    });

    it('gives a debugger the pack its script module UUID picks, which alone stops at its breakpoints', () => {
        const uuids = ['4f2b6b3a-0000-4000-8000-000000000001', '4f2b6b3a-0000-4000-8000-000000000002'];
        const source = (label: string) => `import { system } from '@minecraft/server';
system.run(() => {
    const label = '${label}';
    console.warn(label);
});`;
        const { scripts, log } = start([
            writePack(source('first'), '2.0.0', 'first', uuids[0]),
            writePack(source('second'), '2.0.0', 'second', uuids[1])
        ]);
        const target = scripts.debugTarget(uuids[1]?.toUpperCase() ?? '');
        if (target === undefined) throw new Error('the second pack is loaded');
        const stops: ScriptValue[] = [];
        const debug = target.engine.attachDebugger(
            {
                paused: () => {
                    stops.push(debug.evaluate(0, 'label'));
                    return 'resume';
                },
                poll: () => undefined
            },
            { context: target.context }
        );
        debug.setBreakpoints('scripts/main.js', [4]);

        scripts.flush();

        expect(stops).toEqual(['second']);
        expect(log.printed()).toEqual(['first', 'second']);
        expect(scripts.debugTarget('4f2b6b3a-0000-4000-8000-00000000ffff')).toBeUndefined();
    });

    it('refuses a pack the config does not allow a module, with BDS’s message', () => {
        const pack = writePack(`console.warn('ran');`, '2.0.0', 'refused');
        const log = new Log();
        const scripts = new WorldScripts({
            library,
            world: new FakeWorld(),
            packs: [
                {
                    ...pack,
                    dependencies: [...pack.dependencies, { module_name: '@minecraft/server-net', version: '1.0.0' }]
                }
            ],
            config: readScriptConfig(undefined),
            log,
            seed: 1n
        });
        runtimes.push(scripts);
        scripts.startEarly();
        expect(log.printed()).toEqual([]);
        expect(log.lines).toContain(
            'error [Scripting] Plugin [refused - 1.0.0] - requesting dependency on module [@minecraft/server-net] but it is not configured to use it.'
        );
    });

    it('runs a pack that declares the beta BDS ships only while the Beta APIs experiment is on', () => {
        const source = `import { WorldBeforeEvents } from '@minecraft/server'; console.warn(typeof WorldBeforeEvents);`;
        const on = start([writePack(source, '2.11.0-beta', 'beta')], { betaApis: true });
        const off = start([writePack(source, '2.11.0-beta', 'beta')]);

        expect(on.log.printed()).toEqual(['function']);
        expect(off.log.printed()).toEqual([]);
        expect(off.log.lines).toContain(
            'error [Scripting] Plugin [beta - 1.0.0] - requesting dependency on beta APIs [@minecraft/server - 2.11.0-beta], but the Beta APIs experiment is not enabled.'
        );
    });

    it('logs that it made no context for a pack with an unknown version, and that the pack did not run', () => {
        const { log } = start(
            [
                writePack('', '2.12.0-beta', 'newer'),
                writePack('', '2.11.0', 'unshipped'),
                writePack(`console.warn('ran');`, '2.0.0', 'stable')
            ],
            { betaApis: true }
        );
        const refusals = log.lines
            .filter((line) => line.startsWith('error [Scripting] Plugin ['))
            .map((line) => line.split('\n')[0]);

        expect(refusals).toEqual([
            'error [Scripting] Plugin [newer - 1.0.0] - failed to create context.',
            'error [Scripting] Plugin [newer] - module [newer - 1.0.0] requested invalid version [2.12.0-beta] of [@minecraft/server].',
            'error [Scripting] Plugin [unshipped - 1.0.0] - failed to create context.',
            'error [Scripting] Plugin [unshipped] - module [unshipped - 1.0.0] requested invalid version [2.11.0] of [@minecraft/server].',
            'error [Scripting] Plugin [newer - 1.0.0] - run failed, no runtime or context available.',
            'error [Scripting] Plugin [unshipped - 1.0.0] - run failed, no runtime or context available.'
        ]);
        expect(log.printed()).toEqual(['ran']);
    });
});
