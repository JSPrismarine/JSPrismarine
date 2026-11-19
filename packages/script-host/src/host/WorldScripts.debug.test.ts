import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test-utils';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import { readScriptConfig, readScriptPack } from './pack';
import { WorldScripts } from './WorldScripts';
import type { ScriptDebugShapeChange } from './world';

/** A {@link MemoryWorld} that records the debug shape changes of each flush. */
class DrawingWorld extends MemoryWorld {
    public readonly drawn: (readonly ScriptDebugShapeChange[])[] = [];
    public drawDebugShapes(changes: readonly ScriptDebugShapeChange[]): void {
        this.drawn.push(changes);
    }
}

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Writes a pack declaring `@minecraft/server` and `@minecraft/debug-utilities`. */
const writePack = (source: string) => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-debug-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'), { recursive: true });
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name: 'debug', uuid: '0b8f5a6c-3d2e-4f1a-9b8c-7d6e5f4a3b2c', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: '1c9e6b7d-4e3f-4a2b-8c9d-8e7f6a5b4c3d', entry: 'scripts/main.js' }],
            dependencies: [
                { module_name: '@minecraft/server', version: '2.0.0' },
                { module_name: '@minecraft/debug-utilities', version: '1.0.0-beta' }
            ]
        })
    );
    writeFileSync(join(directory, 'scripts', 'main.js'), source);
    const read = readScriptPack(directory);
    if (read === undefined) throw new Error('the pack has a script module');
    return read;
};

const PRELUDE = `
import { system, world } from '@minecraft/server';
import { DebugBox, DebugLine, DebugText, debugDrawer } from '@minecraft/debug-utilities';
const log = (line) => console.warn(typeof line === 'string' ? line : JSON.stringify(line));
`;

describe.skipIf(!scriptHostAvailable())("WorldScripts's @minecraft/debug-utilities", () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const running: WorldScripts[] = [];
    afterEach(() => {
        for (const scripts of running.splice(0)) scripts.shutdown();
    });

    const start = (source: string) => {
        const world = new DrawingWorld();
        const lines: string[] = [];
        const scripts = new WorldScripts({
            library,
            world,
            packs: [writePack(PRELUDE + source)],
            config: readScriptConfig(undefined, () => {}),
            betaApis: true,
            log: { info: () => {}, warn: (line) => lines.push(line), error: (line) => lines.push(line) },
            seed: 1n,
            server: TEST_SERVER
        });
        running.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        const printed = () => lines.map((line) => line.replace(/^\[Scripting\] /, ''));
        return { world, scripts, printed };
    };

    it('draws a shape once, draws it again only when the script changes it, and removes it', () => {
        const { world, scripts } = start(`
let box;
let ticks = 0;
system.runInterval(() => {
    ticks++;
    if (ticks === 1) box = new DebugBox({ x: 1, y: 2, z: 3 });
    if (ticks === 1) debugDrawer.addShape(box, world.getDimension('nether'));
    if (ticks === 3) box.color = { red: 1, green: 0, blue: 0, alpha: 1 };
    if (ticks === 5) box.remove();
}, 1);`);
        for (let tick = 0; tick < 7; tick++) scripts.flush();

        expect(world.drawn).toEqual([
            [
                {
                    id: 1,
                    shape: {
                        kind: 'DebugBox',
                        location: { x: 1, y: 2, z: 3 },
                        dimension: 'minecraft:nether',
                        color: { red: 1, green: 1, blue: 1, alpha: 1 },
                        scale: 1,
                        rotation: { x: 0, y: 0, z: 0 },
                        bound: { x: 1, y: 1, z: 1 }
                    }
                }
            ],
            [
                {
                    id: 1,
                    shape: expect.objectContaining({ color: { red: 1, green: 0, blue: 0, alpha: 1 } })
                }
            ],
            [{ id: 1 }]
        ]);
    });

    it("counts a drawn shape's timeLeft down by a tick's 0.05 seconds, and only while it is drawn", () => {
        const { scripts, printed } = start(`
system.run(() => {
    const drawn = new DebugBox({ x: 0, y: 0, z: 0 });
    drawn.timeLeft = 0.2;
    const kept = new DebugBox({ x: 0, y: 0, z: 0 });
    kept.timeLeft = 0.2;
    debugDrawer.addShape(drawn);
    log([drawn.timeLeft, kept.timeLeft, drawn.totalTimeLeft]);
    system.runInterval(() => log([drawn.timeLeft, kept.timeLeft, drawn.totalTimeLeft]), 1);
});`);
        for (let tick = 0; tick < 7; tick++) scripts.flush();

        // A float's 0.2 less a tick at a time, as BDS's float holds it, then 0 once the time runs out.
        expect(printed().map((line) => JSON.parse(line)[0])).toEqual([
            Math.fround(0.2),
            expect.closeTo(0.15, 6),
            expect.closeTo(0.1, 6),
            expect.closeTo(0.05, 6),
            0,
            0,
            0
        ]);
        expect(new Set(printed().map((line) => JSON.parse(line).slice(1).join(' ')))).toEqual(
            new Set([`${Math.fround(0.2)} ${Math.fround(0.2)}`])
        );
    });

    it('sends a shape that runs out of time, and its removal once it has', () => {
        const { world, scripts } = start(`
system.run(() => {
    const line = new DebugLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    line.timeLeft = 0.1;
    debugDrawer.addShape(line);
});`);
        for (let tick = 0; tick < 5; tick++) scripts.flush();

        expect(world.drawn).toEqual([
            [{ id: 1, shape: expect.objectContaining({ kind: 'DebugLine', timeLeft: expect.closeTo(0.05, 6) }) }],
            [{ id: 1 }]
        ]);
    });

    it('attaches a shape to a player, reads the same Player back and draws it on their entity id', () => {
        const { world, scripts, printed } = start(`
system.run(() => {
    const [player] = world.getPlayers();
    const box = new DebugBox({ x: 0, y: 0, z: 0 });
    box.attachedTo = player;
    log([box.attachedTo === player, box.attachedTo.name]);
    debugDrawer.addShape(box);
});`);
        const player = world.join('Alex');
        scripts.flush();
        scripts.flush();

        expect(printed()).toEqual(['[true,"Alex"]']);
        expect(world.drawn).toEqual([[{ id: 1, shape: expect.objectContaining({ attachedTo: player }) }]]);
    });

    it('draws a RawMessage text as chat reads it and keeps it inside rawtext', () => {
        const { world, scripts, printed } = start(`
system.run(() => {
    const text = new DebugText({ x: 0, y: 0, z: 0 }, { text: 'hi' });
    log(text.text);
    debugDrawer.addShape(text);
});`);
        scripts.flush();
        scripts.flush();

        expect(printed()).toEqual(['{"rawtext":[{"text":"hi"}]}']);
        expect(world.drawn).toEqual([[{ id: 1, shape: expect.objectContaining({ kind: 'DebugText', text: 'hi' }) }]]);
    });

    it('removes the shapes it drew when the scripts reload, and keeps counting ids after', () => {
        const { world, scripts } = start(`
system.run(() => debugDrawer.addShape(new DebugBox({ x: 0, y: 0, z: 0 })));`);
        scripts.flush();
        scripts.flush();
        scripts.reload();
        scripts.flush();
        scripts.flush();

        expect(
            world.drawn.map((changes) => changes.map((change) => [change.id, change.shape?.kind ?? 'removed']))
        ).toEqual([[[1, 'DebugBox']], [[1, 'removed']], [[2, 'DebugBox']]]);
    });
});
