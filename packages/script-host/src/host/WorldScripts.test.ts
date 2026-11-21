import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test-utils';
import type { ScriptPack } from './pack';
import { readScriptConfig, readScriptPack } from './pack';
import type { CriticalException, WatchdogSettings } from './WorldScripts';
import { WorldScripts } from './WorldScripts';
import { viewDirection } from './serverEntities';
import type { ScriptValue } from '../values';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import type { JsprismarineServerMembers, ScriptBossBarState, ScriptPerformance } from './jsprismarineMembers';

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
            world?: MemoryWorld;
            seed?: bigint;
            watchdog?: WatchdogSettings;
            critical?: CriticalException[];
            betaApis?: boolean;
            members?: JsprismarineServerMembers;
        } = {}
    ) => {
        const world = options.world ?? new MemoryWorld();
        const log = new Log();
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs,
            config: readScriptConfig(undefined),
            log,
            seed: options.seed ?? 1n,
            ...(options.watchdog === undefined ? {} : { watchdog: options.watchdog }),
            ...(options.betaApis === undefined ? {} : { betaApis: options.betaApis }),
            ...(options.members === undefined ? {} : { members: options.members }),
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

    it('stops a tick whose callbacks keep queuing more at the tick budget, one step for each callback', () => {
        const { scripts, log } = start(
            [
                writePack(`import { system } from '@minecraft/server';
                let chained = 0;
                const again = () => { if (system.currentTick === 0) chained++; system.runTimeout(again, 0); };
                system.run(again);
                system.runTimeout(() => console.warn('tick 0 ran', chained), 1);`)
            ],
            { watchdog: { hangSteps: 50, shutdown: false } }
        );
        scripts.flush();
        scripts.flush();

        const [line] = log.printed();
        const chained = Number(line?.split(' ').at(-1));
        expect(chained).toBeGreaterThan(0);
        expect(chained).toBeLessThanOrEqual(50);
        expect(log.lines).toContain(
            "error [Scripting] [Watchdog] Unhandled critical exception of type 'Hang' in behavior pack 'probe'"
        );
    });

    it('stops a tick whose after-events keep committing more at the tick budget', () => {
        const world = new MemoryWorld();
        const { scripts, log } = start(
            [
                writePack(`import { world, WeatherType } from '@minecraft/server';
                let events = 0;
                world.afterEvents.weatherChange.subscribe((event) => {
                    events++;
                    const next = event.newWeather === WeatherType.Rain ? WeatherType.Clear : WeatherType.Rain;
                    world.getDimension('overworld').setWeather(next);
                });
                world.afterEvents.worldLoad.subscribe(() => world.getDimension('overworld').setWeather(WeatherType.Rain));`)
            ],
            { world, watchdog: { hangSteps: 50, shutdown: false } }
        );
        scripts.flush();

        expect(log.lines).toContain(
            "error [Scripting] [Watchdog] Unhandled critical exception of type 'Hang' in behavior pack 'probe'"
        );
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
        const world = new MemoryWorld();
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

    it('keeps a Date subclass and its clock, even after a script replaces Reflect.construct', () => {
        const world = new MemoryWorld();
        world.now = 1000;
        const { scripts, log } = start(
            [
                writePack(`import { system } from '@minecraft/server';
                class Stamp extends Date { kind() { return 'stamp'; } }
                system.run(() => {
                    const now = new Stamp();
                    console.warn(now.kind(), now instanceof Stamp, now.getTime(), new Stamp(5).getTime());
                    Reflect.construct = () => ({});
                    console.warn(new Stamp().kind(), new Date().getTime(), new Date(7).getTime());
                });`)
            ],
            { world }
        );
        scripts.flush();

        expect(log.printed()).toEqual(['stamp true 1000 5', 'stamp 1000 7']);
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
        const { scripts, log } = start([writePack(source, '2.12.0-beta')], {
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
        const { scripts, log } = start([writePack(source, '2.12.0-beta')], {
            watchdog: { hangSteps: 40, shutdown: true },
            critical,
            betaApis: true
        });
        for (let tick = 0; tick < 3; tick++) scripts.flush();

        expect(log.printed()).toEqual(['terminate Hang']);
        expect(critical).toEqual(['Hang']);
    });

    it('sends the text of a message, and stops a message whose length never ends at the step budget', () => {
        const world = new MemoryWorld();
        const { scripts, log } = start(
            [
                writePack(`import { system, world } from '@minecraft/server';
                system.run(() => world.sendMessage(['a', { text: 'b' }, { rawtext: [{ translate: 'c' }, 'd'] }]));
                system.runTimeout(() => world.sendMessage({ rawtext: { length: Infinity } }), 1);
                system.runTimeout(() => console.warn('next task'), 2);`)
            ],
            { world, watchdog: { hangSteps: 1000, shutdown: false } }
        );
        for (let tick = 0; tick < 3; tick++) scripts.flush();

        expect(world.messages).toEqual(['abcd']);
        expect(log.lines).toContain(
            "error [Scripting] [Watchdog] Unhandled critical exception of type 'Hang' in behavior pack 'probe'"
        );
        expect(log.printed()).toEqual(['next task']);
    });

    it('shuts down once, without sending watchdogTerminate again, when its handler itself hangs', () => {
        const source = `import { system } from '@minecraft/server';
            system.beforeEvents.watchdogTerminate.subscribe(() => { console.warn('terminate'); while (true) {} });
            system.runTimeout(() => { while (true) {} }, 1);`;
        const critical: CriticalException[] = [];
        const { scripts, log } = start([writePack(source, '2.12.0-beta')], {
            watchdog: { hangSteps: 40, shutdown: true },
            critical,
            betaApis: true
        });
        for (let tick = 0; tick < 3; tick++) scripts.flush();

        expect(log.printed()).toEqual(['terminate']);
        expect(critical).toEqual(['Hang']);
        expect(log.lines.filter((line) => line.includes('Watchdog shutting down server'))).toHaveLength(1);
    });

    it('frees a runtime the watchdog stopped when it shuts down, without sending shutdown', () => {
        const world = new MemoryWorld();
        const critical: CriticalException[] = [];
        const { scripts, log } = start(
            [
                writePack(`import { system } from '@minecraft/server';
                system.beforeEvents.shutdown.subscribe(() => console.warn('shutdown'));
                system.runTimeout(() => { while (true) {} }, 1);`)
            ],
            { world, watchdog: { hangSteps: 40, shutdown: true }, critical }
        );
        for (let tick = 0; tick < 2; tick++) scripts.flush();
        expect(critical).toEqual(['Hang']);
        // The weather, chat, block break and item use guards.
        expect(world.guardCount()).toBe(4);

        scripts.shutdown();

        expect(world.guardCount()).toBe(0);
        expect(() => scripts.stats()).toThrow();
        expect(log.printed()).toEqual([]);
    });

    it('does not call a callback an earlier callback of the same event unsubscribed', () => {
        const { scripts, log } = start([
            writePack(`import { world } from '@minecraft/server';
                const second = () => console.warn('second');
                world.afterEvents.worldLoad.subscribe(() => {
                    console.warn('first');
                    world.afterEvents.worldLoad.unsubscribe(second);
                });
                world.afterEvents.worldLoad.subscribe(second);`)
        ]);
        scripts.flush();

        expect(log.printed()).toEqual(['first']);
    });

    it('gives a player who takes a leaving player’s place a Player object of their own', () => {
        const world = new MemoryWorld();
        const first = world.join('First');
        const { scripts, log } = start(
            [
                writePack(
                    `import { system, world } from '@minecraft/server';
                    let listed, sender;
                    world.beforeEvents.chatSend.subscribe((event) => {
                        if (sender === undefined) sender = event.sender;
                        else console.warn('same sender', event.sender === sender, event.sender === world.getAllPlayers()[0]);
                    });
                    system.run(() => { listed = world.getAllPlayers()[0]; });
                    system.runTimeout(() => console.warn('same listed', world.getAllPlayers()[0] === listed), 1);`,
                    '2.12.0-beta'
                )
            ],
            { world, betaApis: true }
        );
        world.chat(first, 'hello');
        scripts.flush();
        world.leave(first);
        world.chat(world.join('Second'), 'hello');
        scripts.flush();

        expect(log.printed()).toEqual(['same sender false true', 'same listed false']);
    });

    it("lets world.beforeEvents.chatSend cancel a player's chat, in restricted execution", () => {
        const world = new MemoryWorld();
        world.join('Alex');
        const steve = world.join('Steve');
        const { log } = start(
            [
                writePack(
                    `import { Player, world } from '@minecraft/server';
                    world.beforeEvents.chatSend.subscribe((event) => {
                        console.warn(event.message, event.sender instanceof Player, event.sender === world.getAllPlayers()[1]);
                        try { world.playMusic('record.cat'); } catch (error) { console.warn(String(error)); }
                        if (event.message === 'cancel me') event.cancel = true;
                    });`,
                    '2.12.0-beta'
                )
            ],
            { world, betaApis: true }
        );

        world.chat(steve, 'hello');
        world.chat(steve, 'cancel me');

        expect(world.chats).toEqual([`${steve}: hello`]);
        const restricted = 'ReferenceError: Native function [World::playMusic] cannot be used in restricted execution.';
        expect(log.printed()).toEqual(['hello true true', restricted, 'cancel me true true', restricted]);
    });

    it('lets a before-event veto or change the world’s action, and sends the after-event in the flush', () => {
        const world = new MemoryWorld();
        const { scripts, log } = start(
            [
                writePack(`import { system, world, WeatherType } from '@minecraft/server';
                world.beforeEvents.weatherChange.subscribe((event) => {
                    console.warn('before', event.newWeather);
                    if (event.newWeather === WeatherType.Thunder) event.cancel = true;
                    if (event.newWeather === WeatherType.Rain) event.newWeather = WeatherType.Thunder;
                });
                world.afterEvents.weatherChange.subscribe((event) => console.warn('after', event.dimension, event.previousWeather, event.newWeather));
                system.run(() => { const overworld = world.getDimension('overworld'); overworld.setWeather(WeatherType.Thunder); console.warn('weather', world.getDimension('minecraft:overworld').id); });
                system.runTimeout(() => {
                    const overworld = world.getDimension('overworld');
                    overworld.setWeather(WeatherType.Clear, 100);
                    overworld.setWeather(WeatherType.Rain, 100);
                }, 1);`)
            ],
            { world }
        );
        scripts.flush();
        expect(world.weather()).toBe('Clear');
        scripts.flush();
        expect(world.weather()).toBe('Thunder');
        // The Clear asked for while it is Clear changes nothing, so no guard or event sees it.
        expect(log.printed()).toEqual([
            'before Thunder',
            'weather minecraft:overworld',
            'before Rain',
            'after overworld Clear Thunder'
        ]);
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
                `import { system, world } from '@minecraft/server'; system.run(() => world.getAllPlayers()); world.structureManager.placeJigsaw;`
            )
        ]);
        const coverage = log.lines.find((line) => line.includes('Script API members'));
        expect(coverage).toMatch(
            /^info \[Scripting\] \[probe\] uses 4 Script API members, 3 of them implemented \(@minecraft\/server 2\.11\.0: \d+ of \d+/
        );
        expect(log.lines).toContain('info [Scripting] [probe] not implemented yet: placeJigsaw');
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

    it('names each pack once its context is ready, so a debugger attached there stops at its first line', () => {
        const uuid = '4f2b6b3a-0000-4000-8000-000000000003';
        const pack = writePack(`const label = 'top level';\nconsole.warn(label);`, '2.0.0', 'early', uuid);
        const log = new Log();
        const lines: number[] = [];
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world: new MemoryWorld(),
            packs: [pack],
            config: readScriptConfig(undefined),
            log,
            seed: 1n,
            onPackLoaded: (moduleUuid, target) => {
                expect(moduleUuid).toBe(uuid);
                const debug = target.engine.attachDebugger(
                    {
                        paused: () => {
                            lines.push(debug.frames()[0]?.line ?? 0);
                            debug.detach();
                            return 'resume';
                        },
                        poll: () => undefined
                    },
                    { context: target.context }
                );
                debug.setBreakpoints('scripts/main.js', [1]);
            }
        });
        runtimes.push(scripts);

        scripts.startEarly();

        expect(lines).toEqual([1]);
        expect(log.printed()).toEqual(['top level']);
    });

    it('refuses a pack the config does not allow a module, with BDS’s message', () => {
        const pack = writePack(`console.warn('ran');`, '2.0.0', 'refused');
        const log = new Log();
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world: new MemoryWorld(),
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
        const on = start([writePack(source, '2.12.0-beta', 'beta')], { betaApis: true });
        const off = start([writePack(source, '2.12.0-beta', 'beta')]);

        expect(on.log.printed()).toEqual(['function']);
        expect(off.log.printed()).toEqual([]);
        expect(off.log.lines).toContain(
            'error [Scripting] Plugin [beta - 1.0.0] - requesting dependency on beta APIs [@minecraft/server - 2.12.0-beta], but the Beta APIs experiment is not enabled.'
        );
    });

    it('logs that it made no context for a pack with an unknown version, and that the pack did not run', () => {
        const { log } = start(
            [
                writePack('', '2.13.0-beta', 'newer'),
                writePack('', '2.12.0', 'unshipped'),
                writePack(`console.warn('ran');`, '2.0.0', 'stable')
            ],
            { betaApis: true }
        );
        const refusals = log.lines
            .filter((line) => line.startsWith('error [Scripting] Plugin ['))
            .map((line) => line.split('\n')[0]);

        expect(refusals).toEqual([
            'error [Scripting] Plugin [newer - 1.0.0] - failed to create context.',
            'error [Scripting] Plugin [newer] - module [newer - 1.0.0] requested invalid version [2.13.0-beta] of [@minecraft/server].',
            'error [Scripting] Plugin [unshipped - 1.0.0] - failed to create context.',
            'error [Scripting] Plugin [unshipped] - module [unshipped - 1.0.0] requested invalid version [2.12.0] of [@minecraft/server].',
            'error [Scripting] Plugin [newer - 1.0.0] - run failed, no runtime or context available.',
            'error [Scripting] Plugin [unshipped - 1.0.0] - run failed, no runtime or context available.'
        ]);
        expect(log.printed()).toEqual(['ran']);
    });

    it("continues an async callback after its await in the flush, with the pack's promise jobs", () => {
        const { scripts, log } = start([
            writePack(`import { system, world } from '@minecraft/server';
                system.run(async () => { await null; console.warn('system.run'); });
                world.afterEvents.worldLoad.subscribe(async () => { await null; console.warn('worldLoad'); });`)
        ]);
        scripts.flush();

        expect(log.printed()).toEqual(['system.run', 'worldLoad']);
    });

    describe('@jsprismarine/server', () => {
        it('resolves a dynamic import without a manifest entry, to frozen values the server supplied', () => {
            const { scripts, log } = start([
                writePack(`import { world } from '@minecraft/server';
                    world.afterEvents.worldLoad.subscribe(async () => {
                        const jsp = await import('@jsprismarine/server');
                        const again = await import('@jsprismarine/server');
                        console.warn(JSON.stringify(Object.keys(jsp)));
                        console.warn(JSON.stringify(jsp.jsprismarine));
                        console.warn(Object.isFrozen(jsp.jsprismarine), jsp.jsprismarine instanceof Object, jsp === again);
                    });`)
            ]);
            scripts.flush();

            expect(log.printed()).toEqual([
                '["jsprismarine"]',
                JSON.stringify({ name: 'JSPrismarine', ...TEST_SERVER }),
                'true true true'
            ]);
        });

        it('resolves a static import too, since a module under @jsprismarine/ needs no manifest entry', () => {
            const { log } = start([
                writePack(`import { jsprismarine } from '@jsprismarine/server'; console.warn(jsprismarine.name);`)
            ]);

            expect(log.printed()).toEqual(['JSPrismarine']);
        });

        /** A server whose performance and pings the test sets, and which records every boss bar call. */
        class RecordingMembers implements JsprismarineServerMembers {
            public current: ScriptPerformance = { tps: 20, tpsAverages: [20, 20, 20], lastTickMs: 0, averageTickMs: 0 };
            public readonly pings = new Map<string, number>();
            public readonly calls: string[] = [];
            public performance(): ScriptPerformance {
                return this.current;
            }
            public ping(player: string): number | undefined {
                return this.pings.get(player);
            }
            public showBossBar(player: string, bar: number, state: ScriptBossBarState): void {
                this.calls.push(`show ${player} ${bar} ${JSON.stringify(state)}`);
            }
            public updateBossBar(player: string, bar: number, state: ScriptBossBarState): void {
                this.calls.push(`update ${player} ${bar} ${JSON.stringify(state)}`);
            }
            public hideBossBar(player: string, bar: number): void {
                this.calls.push(`hide ${player} ${bar}`);
            }
            public setPlayerListName(player: string, name: string): void {
                this.calls.push(`name ${player} ${JSON.stringify(name)}`);
            }
            public resetPlayerListName(player: string): void {
                this.calls.push(`unname ${player}`);
            }
        }

        /** Each bar call the server got, as its kind, its player and the bar's id. */
        const barCalls = (members: RecordingMembers) =>
            members.calls.map((call) => {
                const [kind, player, id] = call.split(' ');
                return { kind, player, id: Number(id) };
            });

        /** Starts a pack whose top level keeps the module and the world's players in globals. */
        const startWithMembers = (body: string) => {
            const members = new RecordingMembers();
            const world = new MemoryWorld();
            const { scripts, log } = start(
                [
                    writePack(`import { system, world } from '@minecraft/server';
                        const show = (label, call) => {
                            try { console.warn(label, JSON.stringify(call())); } catch (error) { console.warn(label, String(error)); }
                        };
                        let jsp;
                        import('@jsprismarine/server').then((module) => { jsp = module; });
                        ${body}`)
                ],
                { world, members }
            );
            return { scripts, world, log, members };
        };

        it('reads performance from the server each time a script reads it', () => {
            const { scripts, log, members } = startWithMembers(`
                system.runInterval(() => show('tick', () => [jsp.performance.tps, jsp.performance.tpsAverages, jsp.performance.lastTickMs, jsp.performance.averageTickMs, Object.isFrozen(jsp.performance.tpsAverages)]), 1);`);
            scripts.flush();
            scripts.flush();
            members.current = { tps: 12.5, tpsAverages: [19, 18.5, 18], lastTickMs: 80, averageTickMs: 61.25 };
            scripts.flush();

            expect(log.printed()).toEqual(['tick [20,[20,20,20],0,0,true]', 'tick [12.5,[19,18.5,18],80,61.25,true]']);
        });

        it("gives a player's ping, undefined without a sample or once they left, and refuses what is not a player", () => {
            const { scripts, world, log, members } = startWithMembers(`
                let players;
                const pings = () => players.map((player) => jsp.getPing(player) ?? 'none');
                system.runTimeout(() => {
                    players = world.getAllPlayers();
                    show('pings', pings);
                }, 1);
                system.runTimeout(() => {
                    show('after Steve left', pings);
                    show('not a player', () => jsp.getPing({ id: players[1].id }));
                }, 2);`);
            const steve = world.join('Steve');
            const alex = world.join('Alex');
            // A third player, whose connection has no sample yet.
            world.join('Nobody');
            members.pings.set(steve, 42);
            members.pings.set(alex, 30);
            scripts.flush();
            scripts.flush();
            world.leave(steve);
            scripts.flush();

            expect(log.printed()).toEqual([
                'pings [42,30,"none"]',
                'after Steve left ["none",30,"none"]',
                'not a player TypeError: getPing takes a Player as its player'
            ]);
        });

        it('shows, updates and hides a boss bar, with what the options leave out kept', () => {
            const { scripts, world, log, members } = startWithMembers(`
                let bar;
                system.runTimeout(() => {
                    bar = jsp.bossBars.show(world.getAllPlayers()[0], { text: 'TPS: 20' });
                    show('shown', () => [bar.isValid, bar.player === world.getAllPlayers()[0]]);
                    bar.update({ progress: 1.5, color: 'red' });
                    bar.update({ text: 'TPS: 12' });
                }, 1);
                system.runTimeout(() => {
                    bar.hide();
                    show('hidden', () => bar.isValid);
                    bar.update({ text: 'gone' });
                    bar.hide();
                }, 2);`);
            const steve = world.join('Steve');
            scripts.flush();
            scripts.flush();
            scripts.flush();

            expect(log.printed()).toEqual(['shown [true,true]', 'hidden false']);
            const id = barCalls(members)[0]?.id;
            expect(members.calls).toEqual([
                `show ${steve} ${id} {"text":"TPS: 20","progress":1,"color":"pink"}`,
                `update ${steve} ${id} {"text":"TPS: 20","progress":1,"color":"red"}`,
                `update ${steve} ${id} {"text":"TPS: 12","progress":1,"color":"red"}`,
                `hide ${steve} ${id}`
            ]);
        });

        it('refuses boss bar options of the wrong type, naming the member and the property', () => {
            const { scripts, world, log, members } = startWithMembers(`
                system.runTimeout(() => {
                    const player = world.getAllPlayers()[0];
                    show('color', () => jsp.bossBars.show(player, { color: 'gold' }));
                    show('progress', () => jsp.bossBars.show(player, { progress: Number.NaN }));
                    show('text', () => jsp.bossBars.show(player, { text: 20 }));
                    show('update', () => jsp.bossBars.show(player).update(7));
                }, 1);`);
            world.join('Steve');
            scripts.flush();
            scripts.flush();

            expect(log.printed()).toEqual([
                'color TypeError: bossBars.show takes one of pink, blue, red, green, yellow, purple, rebeccaPurple, white as its color',
                'progress TypeError: bossBars.show takes a finite number as its progress',
                'text TypeError: bossBars.show takes a string as its text',
                'update TypeError: BossBar.update takes an object as its options'
            ]);
            expect(members.calls).toHaveLength(1);
        });

        it("takes a player's bars down as they leave, and shows none to a player who left", () => {
            const { scripts, world, log, members } = startWithMembers(`
                let bar;
                let steve;
                system.runTimeout(() => {
                    steve = world.getAllPlayers()[0];
                    bar = jsp.bossBars.show(steve, { text: 'one' });
                }, 1);
                system.runTimeout(() => {
                    show('after leaving', () => [bar.isValid, jsp.bossBars.show(steve).isValid]);
                }, 2);`);
            const steve = world.join('Steve');
            scripts.flush();
            scripts.flush();
            world.leave(steve);
            scripts.flush();

            expect(log.printed()).toEqual(['after leaving [false,false]']);
            const id = barCalls(members)[0]?.id;
            expect(members.calls).toEqual([
                `show ${steve} ${id} {"text":"one","progress":1,"color":"pink"}`,
                `hide ${steve} ${id}`
            ]);
        });

        it('takes every bar down when the scripts stop, and gives the next runtime new bar ids', () => {
            const { scripts, world, members } = startWithMembers(`
                system.runTimeout(() => {
                    const player = world.getAllPlayers()[0];
                    jsp.bossBars.show(player, { text: 'one' });
                    jsp.bossBars.show(player, { text: 'two' });
                }, 1);`);
            const steve = world.join('Steve');
            scripts.flush();
            scripts.flush();
            scripts.reload();
            scripts.flush();
            scripts.flush();
            scripts.shutdown();

            const calls = barCalls(members);
            expect(calls.map(({ kind, player }) => `${kind} ${player}`)).toEqual([
                ...Array<string>(2).fill(`show ${steve}`),
                ...Array<string>(2).fill(`hide ${steve}`),
                ...Array<string>(2).fill(`show ${steve}`),
                ...Array<string>(2).fill(`hide ${steve}`)
            ]);
            const ids = calls.map(({ id }) => id);
            // Each runtime's stop hides the bars it showed, and the next runtime's bars are new.
            expect(ids.slice(2, 4)).toEqual(ids.slice(0, 2));
            expect(ids.slice(6, 8)).toEqual(ids.slice(4, 6));
            expect(new Set(ids).size).toBe(4);
        });

        it('takes every bar down when the watchdog stops the scripts', () => {
            const members = new RecordingMembers();
            const world = new MemoryWorld();
            const { scripts } = start(
                [
                    writePack(`import { system, world } from '@minecraft/server';
                        let jsp;
                        import('@jsprismarine/server').then((module) => { jsp = module; });
                        system.runTimeout(() => jsp.bossBars.show(world.getAllPlayers()[0], { text: 'one' }), 1);
                        system.runTimeout(() => { const recurse = () => recurse() + 1; try { recurse(); } catch {} }, 2);`)
                ],
                { world, members, watchdog: { hangSteps: 1000, shutdown: true } }
            );
            const steve = world.join('Steve');
            scripts.flush();
            scripts.flush();
            scripts.flush();

            const [shown] = barCalls(members);
            expect(barCalls(members)).toEqual([shown, { kind: 'hide', player: steve, id: shown!.id }]);
        });

        it('sets and resets a player list name, refusing an empty name and leaving a player who left alone', () => {
            const { scripts, world, log, members } = startWithMembers(`
                let steve;
                system.runTimeout(() => {
                    steve = world.getAllPlayers()[0];
                    jsp.playerList.setDisplayName(steve, '§aSteve');
                    show('empty', () => jsp.playerList.setDisplayName(steve, ''));
                    show('number', () => jsp.playerList.setDisplayName(steve, 7));
                    show('not a player', () => jsp.playerList.setDisplayName({ id: steve.id }, 'x'));
                    jsp.playerList.reset(steve);
                    // A reset of a name no pack set reaches nothing.
                    jsp.playerList.reset(steve);
                }, 1);
                system.runTimeout(() => {
                    jsp.playerList.setDisplayName(steve, 'gone');
                    jsp.playerList.reset(steve);
                }, 2);`);
            const steve = world.join('Steve');
            scripts.flush();
            scripts.flush();
            world.leave(steve);
            scripts.flush();

            expect(log.printed()).toEqual([
                'empty TypeError: playerList.setDisplayName takes a non-empty string as its name',
                'number TypeError: playerList.setDisplayName takes a non-empty string as its name',
                'not a player TypeError: playerList.setDisplayName takes a Player as its player'
            ]);
            expect(members.calls).toEqual([`name ${steve} "§aSteve"`, `unname ${steve}`]);
        });

        it('gives every player list name back when the scripts stop, and only the ones still set', () => {
            const { scripts, world, members } = startWithMembers(`
                system.runTimeout(() => {
                    const [steve, alex] = world.getAllPlayers();
                    jsp.playerList.setDisplayName(steve, 'one');
                    jsp.playerList.setDisplayName(steve, 'two');
                    jsp.playerList.setDisplayName(alex, 'three');
                    jsp.playerList.reset(alex);
                }, 1);`);
            const steve = world.join('Steve');
            const alex = world.join('Alex');
            scripts.flush();
            scripts.flush();
            scripts.reload();
            scripts.flush();
            scripts.flush();
            scripts.shutdown();

            const stop = [`name ${steve} "one"`, `name ${steve} "two"`, `name ${alex} "three"`, `unname ${alex}`];
            expect(members.calls).toEqual([...stop, `unname ${steve}`, ...stop, `unname ${steve}`]);
        });

        /** Two packs that keep the module in a global: `provider`, which registers `demo`, and `consumer`. */
        const startTwoPacks = (providerBody: string, consumerBody: string) => {
            const members = new RecordingMembers();
            const world = new MemoryWorld();
            const pack = (name: string, uuid: string, body: string) =>
                writePack(
                    `import { system, world } from '@minecraft/server';
                    const show = (label, call) => {
                        try { console.warn(label, JSON.stringify(call())); } catch (error) { console.warn(label, String(error)); }
                    };
                    let jsp;
                    let placeholders;
                    import('@jsprismarine/server').then((module) => { jsp = module; });
                    import('@jsprismarine/placeholders').then((module) => { placeholders = module; });
                    ${body}`,
                    '2.0.0',
                    name,
                    uuid
                );
            const { scripts, log } = start(
                [
                    pack('provider', '5f3b0f3e-6f1e-4c1c-9d4a-0b7c0a1a0001', providerBody),
                    pack('consumer', '5f3b0f3e-6f1e-4c1c-9d4a-0b7c0a1a0002', consumerBody)
                ],
                { world, members }
            );
            return { scripts, world, log };
        };

        it('renders the tokens of another pack, with the player as the provider\u2019s own object', () => {
            const { scripts, world, log } = startTwoPacks(
                `system.runTimeout(() => {
                    placeholders.register('demo', {
                        keys: ['name', 'same', 'ping', 'nothing', 'count'],
                        resolve(key, player) {
                            if (key === 'name') return player?.name;
                            if (key === 'same') return player === world.getAllPlayers()[0] ? 'own object' : 'copy';
                            if (key === 'ping') return player === undefined ? undefined : jsp.getPing(player);
                            if (key === 'count') return this.keys.length;
                            return undefined;
                        }
                    });
                }, 1);`,
                `system.runTimeout(() => {
                    const steve = world.getAllPlayers()[0];
                    show('for Steve', () => placeholders.resolve('{demo:name} {demo:same} {demo:ping}ms {demo:count}', steve));
                    show('for no one', () => placeholders.resolve('{demo:name} {demo:ping} {demo:count} {demo:nothing} {demo:other} {other:name} {Demo:name} {demo}', undefined));
                    show('namespaces', () => placeholders.namespaces());
                    show('frozen', () => [Object.isFrozen(placeholders.namespaces()), Object.isFrozen(placeholders.namespaces()[0]), Object.isFrozen(placeholders.namespaces()[0].keys)]);
                }, 2);`
            );
            world.join('Steve');
            scripts.flush();
            scripts.flush();
            scripts.flush();

            expect(log.printed()).toEqual([
                'for Steve "Steve own object {demo:ping}ms 5"',
                'for no one "{demo:name} {demo:ping} 5 {demo:nothing} {demo:other} {other:name} {Demo:name} {demo}"',
                'namespaces [{"namespace":"demo","keys":["name","same","ping","nothing","count"]}]',
                'frozen [true,true,true]'
            ]);
        });

        it('leaves the token of a resolver that throws and logs the throw once per namespace', () => {
            const { scripts, log } = startTwoPacks(
                `system.runTimeout(() => {
                    placeholders.register('bad', { keys: ['boom', 'fine'], resolve: (key) => { if (key === 'boom') throw new RangeError('no value'); return 'ok'; } });
                }, 1);`,
                `system.runTimeout(() => {
                    show('first', () => placeholders.resolve('{bad:boom} {bad:fine} {bad:boom}'));
                    show('second', () => placeholders.resolve('{bad:boom}'));
                }, 2);`
            );
            scripts.flush();
            scripts.flush();
            scripts.flush();

            expect(log.printed()).toEqual(['first "{bad:boom} ok {bad:boom}"', 'second "{bad:boom}"']);
            const reported = log.lines.filter((line) => line.includes('placeholder provider'));
            expect(reported).toHaveLength(1);
            expect(reported[0]).toMatch(
                /^error \[Scripting\] \[provider\] The placeholder provider of bad threw, and its tokens stay as written: RangeError: no value/
            );
        });

        it('refuses a malformed registration, a namespace in use and arguments of the wrong type, naming the member', () => {
            const { scripts, log } = startTwoPacks(
                `system.runTimeout(() => {
                    show('ok', () => Object.keys(placeholders.register('demo', { keys: ['a'], resolve: () => 1 })));
                    show('taken', () => placeholders.register('demo', { keys: ['a'], resolve: () => 1 }));
                    show('namespace', () => placeholders.register('Demo', { keys: ['a'], resolve: () => 1 }));
                    show('key', () => placeholders.register('other', { keys: ['a-b'], resolve: () => 1 }));
                    show('no keys', () => placeholders.register('other', { keys: [], resolve: () => 1 }));
                    show('keys', () => placeholders.register('other', { keys: 'a', resolve: () => 1 }));
                    show('key object', () => placeholders.register('other', { keys: [{}], resolve: () => 1 }));
                    show('resolve', () => placeholders.register('other', { keys: ['a'] }));
                    show('resolve object', () => placeholders.register('other', { keys: ['a'], resolve: {} }));
                    show('provider', () => placeholders.register('other', 7));
                    show('name', () => placeholders.register(7, { keys: ['a'], resolve: () => 1 }));
                    show('text', () => placeholders.resolve(7));
                    show('player', () => placeholders.resolve('x', { id: '1' }));
                }, 1);`,
                `system.runTimeout(() => {
                    show('other pack', () => placeholders.register('demo', { keys: ['a'], resolve: () => 1 }));
                    show('still one', () => placeholders.namespaces().map(({ namespace }) => namespace));
                }, 2);`
            );
            scripts.flush();
            scripts.flush();
            scripts.flush();

            expect(log.printed()).toEqual([
                'ok ["unregister"]',
                'taken Error: The placeholder namespace demo is registered already',
                'namespace TypeError: namespace Demo is not a placeholder name: use lowercase letters, digits and underscores, starting with a letter',
                'key TypeError: key a-b is not a placeholder name: use lowercase letters, digits and underscores, starting with a letter',
                'no keys TypeError: The placeholder namespace other lists no keys',
                'keys TypeError: register takes a list of strings as its keys',
                'key object TypeError: register takes a list of strings as its keys',
                'resolve TypeError: register takes a function as its resolve',
                'resolve object TypeError: register takes a function as its resolve',
                'provider TypeError: register takes an object as its provider',
                'name TypeError: register takes a string as its namespace',
                'text TypeError: resolve takes a string as its text',
                'player TypeError: resolve takes a Player as its player',
                'other pack Error: The placeholder namespace demo is registered already',
                'still one ["demo"]'
            ]);
        });

        it('ends a namespace on unregister and when the scripts stop, so a reload starts with none', () => {
            const { scripts, log } = startTwoPacks(
                `let registration;
                system.runTimeout(() => {
                    show('before registering', () => placeholders.namespaces().length);
                    registration = placeholders.register('demo', { keys: ['a'], resolve: () => 'A' });
                    placeholders.register('kept', { keys: ['b'], resolve: () => 'B' });
                }, 1);
                system.runTimeout(() => { registration.unregister(); registration.unregister(); }, 3);`,
                `system.runInterval(() => show('tick ' + system.currentTick, () => placeholders.resolve('{demo:a}{kept:b}')), 1);`
            );
            scripts.flush();
            scripts.flush();
            scripts.flush();
            scripts.flush();
            scripts.reload();
            scripts.flush();
            scripts.flush();

            // The second runtime registers both again, which a `kept` left behind would refuse.
            expect(log.printed()).toEqual([
                'before registering 0',
                'tick 1 "AB"',
                'tick 2 "AB"',
                'tick 3 "{demo:a}B"',
                'before registering 0',
                'tick 5 "AB"'
            ]);
        });

        it('parses shorthand into a frozen tree and renders a tree or shorthand for a player, with the next change tick', () => {
            const { scripts, world, log } = startTwoPacks(
                `system.runTimeout(() => {
                    placeholders.register('demo', { keys: ['name', 'ping'], resolve: (key, player) => player === undefined ? undefined : key === 'name' ? player.name : 180 });
                }, 1);`,
                `system.runTimeout(() => {
                    const steve = world.getAllPlayers()[0];
                    const template = placeholders.parse('{demo:name} &7{demo:ping}ms');
                    show('parsed', () => template);
                    show('frozen', () => [Object.isFrozen(template), Object.isFrozen(template.rawtext), Object.isFrozen(template.rawtext[0])]);
                    show('tree', () => placeholders.render(template, steve));
                    show('shorthand', () => placeholders.render('{demo:name} &7{demo:ping}ms', steve));
                    show('no player', () => placeholders.render(template));
                    const animated = { rawtext: [
                        { if: '{demo:ping} > 150', then: ['§c', { placeholder: 'demo:ping' }], else: ['§7fast'] },
                        { animate: { interval: 10, frames: [['.'], ['..']] } },
                        { gradient: { colors: ['#ff5555', '#5555ff'], rawtext: ['VIP'] } },
                        { score: { name: '@s', objective: 'kills' } }, ' ', { score: { name: 'Nobody', objective: 'kills' } },
                        ' ', { selector: '@s' }, '|', { selector: '@a' }, '|', { selector: 'Alex' }, '|', { selector: '@e[type=pig]' },
                        ' ', { translate: 'commands.op.success', with: ['x'] }
                    ] };
                    show('animated', () => placeholders.render(animated, steve));
                    show('rendered frozen', () => Object.isFrozen(placeholders.render(animated, steve)));
                    show('bad node', () => placeholders.render({ rawtext: [{ bold: true }] }));
                    show('bad condition', () => placeholders.render({ rawtext: [{ if: '{demo:ping} >', then: [] }] }));
                    show('not a template', () => placeholders.render(7));
                    show('not a player', () => placeholders.render('x', { id: '1' }));
                    show('not shorthand', () => placeholders.parse(7));
                }, 2);`
            );
            const steve = world.join('Steve');
            world.join('Alex');
            world.scoreboard.addObjective('kills', 'Kills');
            world.scoreboard.setScore('kills', { entity: steve }, 7);
            scripts.flush();
            scripts.flush();
            scripts.flush();

            expect(log.printed()).toEqual([
                'parsed {"rawtext":[{"placeholder":"demo:name"},{"text":" §7"},{"placeholder":"demo:ping"},{"text":"ms"}]}',
                'frozen [true,true,true]',
                'tree {"text":"Steve §7180ms"}',
                'shorthand {"text":"Steve §7180ms"}',
                'no player {"text":"{demo:name} §7{demo:ping}ms"}',
                'animated {"text":"§c180.§cV§uI§9P§r7  Steve|Steve, Alex|Alex| commands.op.success","nextChangeTick":10}',
                'rendered frozen true',
                'bad node TypeError: The template node at template.rawtext[0] must be a text, placeholder, if, animate, gradient, translate, score or selector node',
                'bad condition TypeError: The condition {demo:ping} > expects a value, a placeholder or a quoted text at its end',
                'not a template TypeError: The template node at template must be an object with a rawtext list',
                'not a player TypeError: render takes a Player as its player',
                'not shorthand TypeError: parse takes a string as its shorthand'
            ]);
        });

        /** A config store in memory: a value per pack directory, and a way to say the file changed. */
        class MemoryConfigStore implements AddonConfigStore {
            public readonly values = new Map<string, unknown>();
            public readonly writes: string[] = [];
            public readonly watching = new Map<string, () => void>();
            public read(pack: ScriptPack): unknown {
                return this.values.get(pack.directory);
            }
            public write(pack: ScriptPack, value: unknown): void {
                this.writes.push(`${pack.name} ${JSON.stringify(value)}`);
                this.values.set(pack.directory, value);
                this.watching.get(pack.directory)?.();
            }
            public watch(pack: ScriptPack, changed: () => void): () => void {
                this.watching.set(pack.directory, changed);
                return () => this.watching.delete(pack.directory);
            }
            /** The file changed on disk to a value. */
            public changedOnDisk(pack: ScriptPack, value: unknown): void {
                this.values.set(pack.directory, value);
                this.watching.get(pack.directory)?.();
            }
        }

        it('reads, writes and follows the config file through the store, one event per flush, until the scripts stop', () => {
            const store = new MemoryConfigStore();
            const members = new RecordingMembers();
            const pack = writePack(`import { system, world } from '@minecraft/server';
                const show = (label, call) => {
                    try { console.warn(label, JSON.stringify(call())); } catch (error) { console.warn(label, String(error)); }
                };
                let jsp;
                import('@jsprismarine/server').then((module) => { jsp = module; });
                const seen = (event) => show('change', () => [event.value, Object.isFrozen(event.value), Object.isFrozen(event)]);
                system.runTimeout(() => {
                    show('absent', () => [jsp.config.value, 'config' in jsp]);
                    jsp.config.afterEvents.change.subscribe(seen);
                    const other = jsp.config.afterEvents.change.subscribe((event) => show('other', () => event.value));
                    jsp.config.afterEvents.change.unsubscribe(other);
                    jsp.config.write({ interval: 40, groups: { vip: 'x' } });
                    show('after write', () => [jsp.config.value, Object.isFrozen(jsp.config.value.groups)]);
                }, 1);
                system.runTimeout(() => {
                    show('bad write', () => jsp.config.write(undefined));
                    show('bad callback', () => jsp.config.afterEvents.change.subscribe(7));
                }, 3);`);
            const { scripts, log } = start([pack], { members, addonConfig: store });
            scripts.flush();
            scripts.flush();
            // Two changes in one tick give one event, with the value read then.
            store.changedOnDisk(pack, { interval: 10 });
            store.changedOnDisk(pack, { interval: 15 });
            scripts.flush();
            store.changedOnDisk(pack, undefined);
            scripts.flush();
            scripts.reload();
            store.changedOnDisk(pack, { interval: 99 });
            scripts.flush();
            scripts.flush();

            // The second runtime's tick 1 writes again, as the first did.
            expect(store.writes).toEqual(Array<string>(2).fill('probe {"interval":40,"groups":{"vip":"x"}}'));
            expect(log.printed()).toEqual([
                'absent [null,true]',
                'after write [{"interval":40,"groups":{"vip":"x"}},true]',
                'change [{"interval":40,"groups":{"vip":"x"}},true,true]',
                'change [{"interval":15},true,true]',
                'bad write TypeError: config.write takes a value JSON can carry as its value',
                'bad callback TypeError: config.afterEvents.change.subscribe takes a function as its callback',
                'change [null,true,true]',
                // The new runtime subscribes again at its own tick 1, after the change at 99 came in.
                'absent [{"interval":99},true]',
                'after write [{"interval":40,"groups":{"vip":"x"}},true]',
                'change [{"interval":40,"groups":{"vip":"x"}},true,true]'
            ]);
            expect(store.watching.size).toBe(1);
            scripts.shutdown();
            expect(store.watching.size).toBe(0);
        });

        it('refuses a listener that is not a function, drops every subscription of a callback, and stops the watch with the last one', () => {
            const store = new MemoryConfigStore();
            const pack = writePack(`import { system } from '@minecraft/server';
                const show = (label, call) => {
                    try { console.warn(label, JSON.stringify(call())); } catch (error) { console.warn(label, String(error)); }
                };
                let jsp;
                import('@jsprismarine/server').then((module) => { jsp = module; });
                const seen = (event) => show('change', () => event.value);
                const other = (event) => show('other', () => event.value);
                system.runTimeout(() => {
                    show('object', () => jsp.config.afterEvents.change.subscribe({}));
                    jsp.config.afterEvents.change.subscribe(seen);
                    jsp.config.afterEvents.change.subscribe(seen);
                    jsp.config.afterEvents.change.subscribe(other);
                }, 1);
                system.runTimeout(() => jsp.config.afterEvents.change.unsubscribe(seen), 3);
                system.runTimeout(() => jsp.config.afterEvents.change.unsubscribe(other), 5);`);
            const { scripts, log } = start([pack], { members: new RecordingMembers(), addonConfig: store });
            scripts.flush();
            scripts.flush();
            store.changedOnDisk(pack, 1);
            scripts.flush();
            scripts.flush();
            store.changedOnDisk(pack, 2);
            scripts.flush();
            expect(store.watching.size).toBe(1);
            scripts.flush();
            store.changedOnDisk(pack, 3);
            scripts.flush();
            scripts.flush();

            expect(log.printed()).toEqual([
                'object TypeError: config.afterEvents.change.subscribe takes a function as its callback',
                'change 1',
                'change 1',
                'other 1',
                'other 2'
            ]);
            expect(store.watching.size).toBe(0);
        });

        it('spreads a change over flushes within the budget, running each callback once', () => {
            const store = new MemoryConfigStore();
            const pack = writePack(`import { system } from '@minecraft/server';
                let jsp;
                import('@jsprismarine/server').then((module) => { jsp = module; });
                const seen = new Set();
                system.runTimeout(() => {
                    for (let index = 0; index < 1500; index++) {
                        jsp.config.afterEvents.change.subscribe(() => { if (seen.has(index)) console.warn('twice ' + index); seen.add(index); });
                    }
                }, 1);
                system.runInterval(() => console.warn('seen ' + seen.size), 1);`);
            const { scripts, log } = start([pack], {
                members: new RecordingMembers(),
                addonConfig: store,
                watchdog: { hangSteps: 1000, shutdown: false }
            });
            scripts.flush();
            scripts.flush();
            store.changedOnDisk(pack, 1);
            scripts.flush();
            scripts.flush();
            scripts.flush();

            const counts = log
                .printed()
                .filter((line) => line.startsWith('seen '))
                .map((line) => Number(line.slice(5)));
            expect(log.printed().filter((line) => line.startsWith('twice'))).toEqual([]);
            // The budget of 1000 entries per flush spreads the 1500 callbacks over two flushes, none repeated.
            // The interval's own callback takes one of the 1000 entries, the delivery the other 999.
            expect(counts).toEqual([0, 0, 999, 1500]);
        });

        it('leaves config out when the server keeps no config files', () => {
            const { scripts, log } = startWithMembers(`
                system.runTimeout(() => show('config', () => ['config' in jsp, Object.keys(jsp)]), 1);`);
            scripts.flush();
            scripts.flush();

            // A module namespace lists its exports in name order.
            expect(log.printed()).toEqual(['config [false,["bossBars","getPing","jsprismarine","performance"]]']);
        });

        it("renders a selector node through the world's selector grammar, filters included", () => {
            const { scripts, world, log } = startTwoPacks(
                '',
                `system.runTimeout(() => {
                    const steve = world.getAllPlayers()[0];
                    const render = (selector, player) => placeholders.render({ rawtext: [{ selector }] }, player).text;
                    show('selectors', () => ['@a', '@a[tag=vip]', '@s', 'Alex', '@e[type=pig]', '@e[type=minecraft:pig]', '@e[type=cow]', '@a[bogus=1]', '@a[tag=vip'].map((selector) => render(selector, steve)));
                    show('one of them', () => ['@p', '@r[tag=vip]', '@p[tag=vip]', '@s[tag=vip]'].map((selector) => render(selector, steve)));
                    show('from the console', () => ['@s', '@a'].map((selector) => render(selector, undefined)));
                }, 1);`
            );
            world.join('Steve');
            const alex = world.join('Alex');
            world.addTag(alex, 'vip');
            const pig = world.spawnEntity('minecraft:overworld', 'minecraft:pig', { x: 0, y: 64, z: 0 });
            world.setNameTag(pig, 'Porky');
            scripts.flush();
            scripts.flush();

            // A selector the grammar refuses renders as nothing, as an unmatched one does, and
            // `@s` for the console names nobody.
            // The filter runs before `@p` and `@r` pick one, so an untagged Steve still finds Alex.
            expect(log.printed()).toEqual([
                'selectors ["Steve, Alex","Alex","Steve","Alex","Porky","Porky","","",""]',
                'one of them ["Steve","Alex","Alex",""]',
                'from the console ["","Steve, Alex"]'
            ]);
        });

        it('passes no player to a resolver for a player who left', () => {
            const { scripts, world, log } = startTwoPacks(
                `system.runTimeout(() => {
                    placeholders.register('demo', { keys: ['who'], resolve: (key, player) => player === undefined ? 'no one' : player.name });
                }, 1);`,
                `let steve;
                system.runTimeout(() => { steve = world.getAllPlayers()[0]; show('present', () => placeholders.resolve('{demo:who}', steve)); }, 2);
                system.runTimeout(() => show('gone', () => placeholders.resolve('{demo:who}', steve)), 3);`
            );
            const steve = world.join('Steve');
            scripts.flush();
            scripts.flush();
            scripts.flush();
            world.leave(steve);
            scripts.flush();

            expect(log.printed()).toEqual(['present "Steve"', 'gone "no one"']);
        });

        it('leaves the members that reach the server out when the server gives none', () => {
            const { scripts, log } = start([
                writePack(`import { world } from '@minecraft/server';
                    world.afterEvents.worldLoad.subscribe(async () => {
                        const jsp = await import('@jsprismarine/server');
                        console.warn(JSON.stringify(Object.keys(jsp)), 'performance' in jsp);
                    });`)
            ]);
            scripts.flush();

            expect(log.printed()).toEqual(['["jsprismarine"] false']);
        });

        it('resolves @jsprismarine/placeholders without a manifest entry, once per pack, with or without the server members', () => {
            const { scripts, log } = start([
                writePack(`import { world } from '@minecraft/server';
                    world.afterEvents.worldLoad.subscribe(async () => {
                        const placeholders = await import('@jsprismarine/placeholders');
                        const again = await import('@jsprismarine/placeholders');
                        const jsp = await import('@jsprismarine/server');
                        console.warn(JSON.stringify(Object.keys(placeholders).sort()), placeholders === again, 'placeholders' in jsp);
                        console.warn(JSON.stringify(placeholders.namespaces()), Object.isFrozen(placeholders.namespaces()));
                    });`)
            ]);
            scripts.flush();

            expect(log.printed()).toEqual([
                '["namespaces","parse","register","render","resolve"] true false',
                '[] true'
            ]);
        });

        it('rejects another @jsprismarine/ module and an undeclared @minecraft/ one with BDS’s message', () => {
            const { scripts, log } = start([
                writePack(`import { world } from '@minecraft/server';
                    const attempt = (name) => import(name).then(() => console.warn(name + ' resolved'), (error) => console.warn(String(error)));
                    world.afterEvents.worldLoad.subscribe(() => attempt('@jsprismarine/other').then(() => attempt('@minecraft/server-net')));`)
            ]);
            scripts.flush();

            expect(log.printed()).toEqual([
                'ReferenceError: Module [@jsprismarine/other] is unrecognized. If this is a Native module, did you remember to add it to your manifest.json?',
                'ReferenceError: Module [@minecraft/server-net] is unrecognized. If this is a Native module, did you remember to add it to your manifest.json?'
            ]);
        });
    });

    describe('the core members', () => {
        /** Runs `body` once the world has loaded, printing each line it returns through `console.warn`. */
        const run = (body: string, world = new MemoryWorld()) => {
            const { scripts, log } = start(
                [
                    writePack(`import * as mc from '@minecraft/server';
                    const { world, system, ItemStack, BlockPermutation } = mc;
                    const show = (label, call) => {
                        try { console.warn(label, JSON.stringify(call())); } catch (error) { console.warn(label, JSON.stringify(String(error))); }
                    };
                    world.afterEvents.worldLoad.subscribe(() => { ${body} });`)
                ],
                { world }
            );
            scripts.flush();
            return { scripts, world, printed: log.printed() };
        };

        it('reads an entity with one host call and one world read per member', () => {
            const world = new MemoryWorld();
            const { scripts } = start(
                [
                    writePack(`import { system, world } from '@minecraft/server';
                        let stand;
                        world.afterEvents.worldLoad.subscribe(() => {
                            stand = world.getDimension('overworld').spawnEntity('minecraft:armor_stand', { x: 0, y: -60, z: 0 });
                        });
                        system.runTimeout(() => { for (let i = 0; i < 10; i++) stand.location.y; }, 1);`)
                ],
                { world }
            );
            scripts.flush();
            const calls = scripts.stats().hostCalls;
            const reads = world.reads.entity;
            scripts.flush();

            expect(scripts.stats().hostCalls - calls).toBe(10);
            expect(world.reads.entity - reads).toBe(10);
        });

        it('gives an entity its members, and throws BDS errors once it is killed', () => {
            const { printed } = run(`
                const overworld = world.getDimension('overworld');
                show('unknown', () => overworld.spawnEntity('jsp_nothing', { x: 0, y: -60, z: 0 }));
                show('unloaded', () => overworld.spawnEntity('armor_stand', { x: 9999.5, y: -60, z: 0 }));
                const stand = overworld.spawnEntity('armor_stand', { x: 0.5, y: -60, z: 0.5 });
                show('read', () => [stand.typeId, stand.location, stand.dimension === overworld, stand.isValid, stand.nameTag]);
                stand.nameTag = 'Named';
                show('tags', () => [stand.addTag('a'), stand.addTag('a'), stand.hasTag('a'), stand.getTags(), stand.removeTag('a'), stand.removeTag('a')]);
                stand.teleport({ x: 2.5, y: -60, z: 3.5 });
                show('query', () => [
                    overworld.getEntities({ type: 'armor_stand' })[0] === stand,
                    overworld.getEntities({ name: 'Named' }).length,
                    overworld.getEntities({ location: { x: 0, y: -60, z: 0 }, maxDistance: 2 }).length,
                    stand.location
                ]);
                show('kill', () => [stand.kill(), stand.isValid, stand.id, stand.typeId]);
                show('location', () => stand.location);
                show('nameTag', () => { stand.nameTag = 'x'; });
                show('addTag', () => stand.addTag('b'));`);

            expect(printed).toEqual([
                `unknown "InvalidArgumentError: Invalid value passed to argument [0]. 'minecraft:jsp_nothing' is not a valid entity type."`,
                'unloaded "LocationInUnloadedChunkError: Trying to access location (9999.0, -60.0, 0.0) which is not in a chunk currently loaded and ticking."',
                'read ["minecraft:armor_stand",{"x":0.5,"y":-60,"z":0.5},true,true,""]',
                'tags [true,false,true,["a"],true,false]',
                'query [true,1,0,{"x":2.5,"y":-60,"z":3.5}]',
                'kill [true,false,"1","minecraft:armor_stand"]',
                `location "InvalidEntityError: Failed to get property 'location' due to Entity being invalid (has the Entity been removed?)."`,
                `nameTag "InvalidEntityError: Failed to set property 'nameTag' due to Entity being invalid (has the Entity been removed?)."`,
                `addTag "InvalidEntityError: Failed to call function 'addTag' due to Entity being invalid (has the Entity been removed?)."`
            ]);
        });

        it("reads and writes an entity's inventory through copies of its stacks", () => {
            const { printed } = run(`
                const cart = world.getDimension('overworld').spawnEntity('chest_minecart', { x: 0, y: -60, z: 0 });
                const container = cart.getComponent('inventory').container;
                container.setItem(3, new ItemStack('apple', 5));
                container.getItem(3).amount = 1;
                show('slots', () => [container.size, container.emptySlotsCount, container.getItem(3).amount, container.getItem(0)]);
                show('out of range', () => container.setItem(27));
                cart.remove();
                show('gone', () => [container.isValid, cart.isValid]);
                show('size', () => container.size);`);

            expect(printed).toEqual([
                'slots [27,26,5,null]',
                `out of range "Error: Invalid container slot provided '27'. Maximum slot is '26'."`,
                'gone [false,false]',
                `size "Error: Failed to get property 'size'."`
            ]);
        });

        it('reads, sets and resolves blocks', () => {
            const { printed } = run(`
                const overworld = world.getDimension('overworld');
                const grass = overworld.getBlock({ x: 0.5, y: -61, z: -0.5 });
                show('read', () => [grass.typeId, grass.location, grass.dimension === overworld, grass.permutation.type.id]);
                show('unloaded', () => overworld.getBlock({ x: 9999, y: 0, z: 0 }) === undefined);
                show('below', () => overworld.getBlock({ x: 0, y: -65, z: 0 }));
                grass.setType('stone');
                show('setType', () => [grass.typeId, overworld.getBlock({ x: 0, y: -61, z: -1 }).typeId]);
                show('unknown type', () => grass.setType('jsp_nothing'));
                const log = BlockPermutation.resolve('oak_log', { pillar_axis: 'x' });
                grass.setPermutation(log);
                show('permutation', () => [grass.permutation.getAllStates(), grass.permutation.getState('pillar_axis')]);
                show('bad value', () => BlockPermutation.resolve('oak_log', { pillar_axis: 'w' }).getAllStates());
                show('unknown block', () => BlockPermutation.resolve('jsp_nothing'));
                show('unknown state', () => BlockPermutation.resolve('oak_log', { jsp: 1 }));`);

            expect(printed).toEqual([
                'read ["minecraft:grass_block",{"x":0,"y":-61,"z":-1},true,"minecraft:grass_block"]',
                'unloaded true',
                'below "LocationOutOfWorldBoundariesError: Trying to access location (0.0, -65.0, 0.0) which is outside of the world boundaries."',
                'setType ["minecraft:stone","minecraft:stone"]',
                'unknown type "Error: Block type minecraft:jsp_nothing not found."',
                'permutation [{"pillar_axis":"x"},"x"]',
                'bad value {"pillar_axis":"y"}',
                'unknown block "Error: Failed to resolve block \\"minecraft:jsp_nothing\\"."',
                'unknown state "Error: Failed to resolve block \\"minecraft:oak_log\\" with properties: {\\"jsp\\":1}\\n"'
            ]);
        });

        it('makes item stacks that keep what a script writes', () => {
            const { printed } = run(`
                const apple = new ItemStack('apple', 3);
                show('new', () => [apple.typeId, apple.amount, apple.nameTag === undefined, apple.getLore()]);
                apple.nameTag = 'Named';
                apple.setLore(['a', 'b']);
                apple.amount = 65;
                show('written', () => [apple.nameTag, apple.getLore(), apple.amount]);
                show('amount 0', () => { apple.amount = 0; });
                show('unknown', () => new ItemStack('jsp_nothing'));`);

            expect(printed).toEqual([
                'new ["minecraft:apple",3,true,[]]',
                'written ["Named",["a","b"],64]',
                'amount 0 "PropertyOutOfBoundsError: Unsupported or out of bounds value set on Property: amount, Value: 0, Property bounds: [1, 255]"',
                `unknown "Error: Invalid item identifier 'minecraft:jsp_nothing'."`
            ]);
        });

        it('sends the player events, finds players, and keeps one object per player', () => {
            const world = new MemoryWorld();
            const { scripts, log } = start(
                [
                    writePack(`import { world } from '@minecraft/server';
                        world.afterEvents.playerJoin.subscribe((event) => console.warn('join', event.playerName));
                        world.afterEvents.playerSpawn.subscribe((event) => console.warn('spawn', event.player.name, event.initialSpawn, event.player === world.getAllPlayers()[0]));
                        world.beforeEvents.playerLeave.subscribe((event) => console.warn('leaving', event.player.name));
                        world.afterEvents.playerLeave.subscribe((event) => console.warn('left', event.playerName, world.getPlayers({ name: 'Alex' }).length));
                        world.afterEvents.playerSpawn.subscribe((event) => {
                            event.player.sendMessage('hi');
                            try { world.getPlayers({ type: 'player' }); } catch (error) { console.warn(String(error)); }
                        });`)
                ],
                { world }
            );
            const alex = world.join('Alex');
            scripts.flush();
            world.leave(alex);
            scripts.flush();

            expect(log.printed()).toEqual([
                'join Alex',
                'spawn Alex true true',
                'CommandError: Error occurred with parsing command params: Type argument applied to player-only selector',
                'leaving Alex',
                'left Alex 0'
            ]);
            expect(world.messages).toEqual([`${alex}> hi`]);
        });

        it('runs commands and sends scriptEventReceive for /scriptevent', () => {
            const { world, printed } = run(`
                system.afterEvents.scriptEventReceive.subscribe((event) =>
                    console.warn('event', event.id, event.message, event.sourceType, event.sourceEntity === undefined));
                const overworld = world.getDimension('overworld');
                show('scriptevent', () => overworld.runCommand('/scriptevent jsp:hello hi there').successCount);
                show('unknown', () => overworld.runCommand('jspnothing'));`);

            // The event comes in the same flush, after the callback that ran the command, as on BDS.
            expect(printed).toEqual([
                'scriptevent 1',
                'unknown "CommandError: Error occurred with parsing command params: Syntax error: Unexpected \\"jspnothing\\": at \\">>jspnothing<<\\""',
                'event jsp:hello hi there Server true'
            ]);
            expect(world.commands).toEqual([
                'minecraft:overworld: scriptevent jsp:hello hi there',
                'minecraft:overworld: jspnothing'
            ]);
        });

        it('finds an entity by id, and reads its rotation, head and view', () => {
            const world = new MemoryWorld();
            const { printed } = run(
                `
                const overworld = world.getDimension('overworld');
                const stand = overworld.spawnEntity('armor_stand', { x: 0.5, y: -60, z: 0.5 });
                show('getEntity', () => [world.getEntity(stand.id) === stand, world.getEntity('-5'), world.getEntity('x1')]);
                show('getPlayers', () => overworld.getPlayers().length);
                show('look', () => [stand.getRotation(), stand.getHeadLocation(), stand.getViewDirection(), stand.isSneaking]);
                globalThis.stand = stand;`,
                world
            );

            expect(printed).toEqual([
                `getEntity "Error: Entity id 'x1' is invalid."`,
                'getPlayers 0',
                'look [{"x":0,"y":0},{"x":0.5,"y":-58.5,"z":0.5},{"x":0,"y":0,"z":1},false]'
            ]);
        });

        it('turns a rotation into the direction BDS gives', () => {
            const near = (vector: { x: number; y: number; z: number }) =>
                [vector.x, vector.y, vector.z].map((part) => Math.round(part * 1000) / 1000);
            expect(near(viewDirection({ x: 0, y: 90 }))).toEqual([-1, 0, 0]);
            expect(near(viewDirection({ x: -90, y: 0 }))).toEqual([0, 1, 0]);
            expect(near(viewDirection({ x: 0, y: 180 }))).toEqual([-0, 0, -1]);
        });

        it('adds items onto matching stacks first, then into empty slots, and hands back the rest', () => {
            const { printed } = run(`
                const cart = world.getDimension('overworld').spawnEntity('chest_minecart', { x: 0, y: -60, z: 0 });
                const container = cart.getComponent('inventory').container;
                const slot = (index) => { const item = container.getItem(index); return item && [item.typeId, item.amount, item.nameTag]; };
                container.setItem(2, new ItemStack('apple', 60));
                show('merge', () => [container.addItem(new ItemStack('apple', 10)), slot(0), slot(2)]);
                const named = new ItemStack('apple', 2);
                named.nameTag = 'Shiny';
                container.addItem(named);
                show('named', () => [slot(0), slot(1)]);
                for (let index = 0; index < 27; index++) container.setItem(index, new ItemStack('stone', 64));
                container.setItem(26, new ItemStack('stone', 60));
                show('full', () => { const left = container.addItem(new ItemStack('stone', 10)); return [left.typeId, left.amount, slot(26)]; });
                cart.remove();
                show('gone', () => container.addItem(new ItemStack('apple')));`);

            expect(printed).toEqual([
                'merge [null,["minecraft:apple",6,null],["minecraft:apple",64,null]]',
                'named [["minecraft:apple",6,null],["minecraft:apple",2,"Shiny"]]',
                'full ["minecraft:stone",6,["minecraft:stone",64,null]]',
                `gone "Error: Failed to call function 'addItem'."`
            ]);
        });

        it("reads and sets a player's game mode and hotbar slot", () => {
            const world = new MemoryWorld();
            const { scripts, log } = start(
                [
                    writePack(`import { world } from '@minecraft/server';
                        world.afterEvents.playerSpawn.subscribe(({ player }) => {
                            console.warn(player.getGameMode(), player.selectedSlotIndex);
                            player.setGameMode('Creative');
                            player.selectedSlotIndex = 4;
                            console.warn(player.getGameMode(), player.selectedSlotIndex);
                            try { player.selectedSlotIndex = 9; } catch (error) { console.warn(String(error)); }
                            console.warn(player.dimension.getPlayers().map((each) => each.name).join());
                        });`)
                ],
                { world }
            );
            world.join('Alex');
            scripts.flush();

            expect(log.printed()).toEqual([
                'Survival 0',
                'Creative 4',
                'PropertyOutOfBoundsError: Unsupported or out of bounds value set on Property: selectedSlot, Value: 9, Property bounds: [0, 8]',
                'Alex'
            ]);
        });

        it('sends entitySpawn, entityHurt and entityDie with the damage source', () => {
            const { printed } = run(`
                const name = (entity) => entity === undefined ? 'none' : entity.typeId;
                const source = ({ cause, damagingEntity, damagingProjectile }) => [cause, name(damagingEntity), name(damagingProjectile)].join(' ');
                world.afterEvents.entitySpawn.subscribe((event) => console.warn('spawn', event.entity.typeId, event.cause));
                world.afterEvents.entityHurt.subscribe((event) => console.warn('hurt', event.hurtEntity.typeId, event.damage, source(event.damageSource)));
                world.afterEvents.entityDie.subscribe((event) => console.warn('die', event.deadEntity.typeId, event.deadEntity.isValid, source(event.damageSource)));
                const overworld = world.getDimension('overworld');
                const stand = overworld.spawnEntity('armor_stand', { x: 0, y: -60, z: 0 });
                const pig = overworld.spawnEntity('pig', { x: 2, y: -60, z: 0 });
                show('hurt', () => [pig.applyDamage(3), pig.applyDamage(0), pig.applyDamage(2, { cause: 'entityAttack', damagingEntity: stand })]);
                show('fatal', () => [pig.applyDamage(50, { cause: 'fall' }), pig.isValid]);
                show('dead', () => pig.applyDamage(1));`);

            expect(printed).toEqual([
                'hurt [true,false,true]',
                'fatal [true,false]',
                `dead "InvalidEntityError: Failed to call function 'applyDamage' due to Entity being invalid (has the Entity been removed?)."`,
                'spawn minecraft:armor_stand Spawned',
                'spawn minecraft:pig Spawned',
                'hurt minecraft:pig 3 none none none',
                'hurt minecraft:pig 2 entityAttack minecraft:armor_stand none',
                'hurt minecraft:pig 50 fall none none',
                'die minecraft:pig false fall none none'
            ]);
        });

        it('frees the handles of the arrays and objects it returns', () => {
            const { scripts } = run(`
                const overworld = world.getDimension('overworld');
                overworld.spawnEntity('armor_stand', { x: 0, y: -60, z: 0 });
                globalThis.query = () => { for (let i = 0; i < 50; i++) { overworld.getEntities(); overworld.getBlock({ x: 0, y: -61, z: 0 }).permutation; } };
                query();`);
            const before = scripts.stats().handles;
            scripts.flush();
            expect(scripts.stats().handles).toBe(before);
        });
    });
});
