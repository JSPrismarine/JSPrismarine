import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test-utils';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import { readScriptConfig, readScriptPack } from './pack';
import { WorldScripts } from './WorldScripts';

const PACK_UUID = 'aac52733-889b-4c87-abcb-f064ea7735a2';
const MODULE_UUID = '13f251b3-41c9-4271-b2d1-d4abde28890b';

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Writes a pack declaring `@minecraft/server` 2.0.0 whose entry is `source`. */
const writePack = (source: string) => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-persistence-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name: 'persistence', uuid: PACK_UUID, version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: MODULE_UUID, entry: 'scripts/main.js' }],
            dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }]
        })
    );
    writeFileSync(join(directory, 'scripts', 'main.js'), source);
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error('the pack has a script module');
    return pack;
};

/** A prelude: `log` prints what a call returned or threw, one line each. */
const PRELUDE = `
import { DisplaySlotId, ItemStack, system, world } from '@minecraft/server';
const show = (value) => value === undefined ? 'undefined' : Object.is(value, -0) ? '-0' : JSON.stringify(value);
const log = (label, call) => {
    try { console.warn(label + ' ' + show(call())); } catch (error) { console.warn(label + ' ! ' + String(error)); }
};
`;

describe.skipIf(!scriptHostAvailable())("WorldScripts's dynamic properties and scoreboard", () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const running: WorldScripts[] = [];
    afterEach(() => {
        for (const scripts of running.splice(0)) scripts.shutdown();
    });

    /** Runs `source` in a `system.run` task and returns what it printed. */
    const run = (source: string, world = new MemoryWorld()) => {
        const lines: string[] = [];
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs: [writePack(`${PRELUDE}\nsystem.run(() => {\n${source}\n});`)],
            config: readScriptConfig(undefined),
            log: {
                info: () => {},
                warn: (line: string) => lines.push(line.replace(/^\[Scripting\] /, '')),
                error: (line: string) => lines.push(line)
            },
            seed: 1n
        });
        running.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        scripts.flush();
        return { world, lines };
    };

    it("keeps the world's properties in the world, by the pack's header UUID, and counts bytes as BDS does", () => {
        const { world, lines } = run(`
            world.setDynamicProperty('jsp:n', 1.5);
            world.setDynamicProperty('jsp:b', true);
            world.setDynamicProperty('jsp:s', 'é');
            world.setDynamicProperty('jsp:v', { x: 0.1, y: 2, z: -3 });
            world.setDynamicProperty('jsp:z', -0);
            log('n', () => world.getDynamicProperty('jsp:n'));
            log('v', () => world.getDynamicProperty('jsp:v'));
            log('z', () => world.getDynamicProperty('jsp:z'));
            log('ids', () => world.getDynamicPropertyIds());
            log('bytes', () => world.getDynamicPropertyTotalByteCount());
            world.setDynamicProperty('jsp:z');
            world.setDynamicProperty('jsp:b', null);
            log('after delete', () => world.getDynamicPropertyIds());`);
        expect(lines).toEqual([
            'n 1.5',
            'v {"x":0.10000000149011612,"y":2,"z":-3}',
            'z -0',
            'ids ["jsp:n","jsp:b","jsp:s","jsp:v","jsp:z"]',
            // Each id's bytes and one, and 8 for a number, 1 for a boolean, a string's bytes and one, 12 for a vector.
            `bytes ${5 + 8 + 1 + (5 + 1 + 1) + (5 + 3 + 1) + (5 + 12 + 1) + (5 + 8 + 1)}`,
            'after delete ["jsp:n","jsp:s","jsp:v"]'
        ]);
        expect([...(world.properties.get(`world\n${PACK_UUID}`)?.keys() ?? [])]).toEqual(['jsp:n', 'jsp:s', 'jsp:v']);
    });

    it("refuses what BDS refuses, with BDS's messages, and writes none of a bad setDynamicProperties", () => {
        const { lines } = run(`
            log('NaN', () => world.setDynamicProperty('jsp:a', Number.NaN));
            log('bigint', () => world.setDynamicProperty('jsp:a', 5n));
            log('array', () => world.setDynamicProperty('jsp:a', [1, 2, 3]));
            log('object', () => world.setDynamicProperty('jsp:a', { a: 1 }));
            log('long', () => world.setDynamicProperty('jsp:a', 'é'.repeat(20000)));
            log('id', () => world.setDynamicProperty(5, 1));
            log('infinite', () => world.setDynamicProperty('jsp:inf', { x: 0, y: 1e40, z: 0 }));
            log('read infinite', () => world.getDynamicProperty('jsp:inf'));
            log('many', () => world.setDynamicProperties({ 'jsp:m1': 1, 'jsp:m2': Number.NaN }));
            log('after many', () => world.getDynamicProperty('jsp:m1'));
            log('many good', () => world.setDynamicProperties({ 'jsp:m1': 1, 'jsp:m2': 'two' }));
            log('after good', () => [world.getDynamicProperty('jsp:m1'), world.getDynamicProperty('jsp:m2')]);
            log('clear', () => world.clearDynamicProperties());
            log('after clear', () => world.getDynamicPropertyIds());`);
        const failed = 'TypeError: Native variant type conversion failed.';
        expect(lines).toEqual([
            `NaN ! ${failed}`,
            `bigint ! ${failed}`,
            `array ! ${failed}`,
            `object ! ${failed}`,
            "long ! ArgumentOutOfBoundsError: Unsupported or out of bounds value passed to function argument [0]: String length for dynamic property 'jsp:a', Value: 40000, Argument max: 32767",
            'id ! TypeError: Native type conversion failed. Function argument [0] expected type: string',
            'infinite undefined',
            'read infinite ! TypeError: Infinity value is not supported.',
            `many ! ${failed}`,
            'after many undefined',
            'many good undefined',
            'after good [1,"two"]',
            'clear undefined',
            'after clear []'
        ]);
    });

    it("keeps an entity's properties on the entity, and throws InvalidEntityError once it is gone", () => {
        const { world, lines } = run(`
            const stand = world.getDimension('overworld').spawnEntity('minecraft:armor_stand', { x: 0, y: -60, z: 0 });
            stand.setDynamicProperty('jsp:e', 'yes');
            log('get', () => stand.getDynamicProperty('jsp:e'));
            log('world', () => world.getDynamicProperty('jsp:e'));
            stand.remove();
            log('gone', () => stand.getDynamicProperty('jsp:e'));`);
        expect(lines).toEqual([
            'get "yes"',
            'world undefined',
            "gone ! InvalidEntityError: Failed to call function 'getDynamicProperty' due to Entity being invalid (has the Entity been removed?)."
        ]);
        expect([...world.properties.keys()].some((key) => key.endsWith(`\n${PACK_UUID}`))).toBe(true);
    });

    it("keeps an item stack's properties on the stack, by the module UUID, and only on one that does not stack", () => {
        const { lines } = run(`
            const sword = new ItemStack('minecraft:diamond_sword');
            sword.setDynamicProperty('jsp:i', 3);
            sword.setDynamicProperty('jsp:v', { x: 1, y: 2, z: 3 });
            log('get', () => [sword.getDynamicProperty('jsp:i'), sword.getDynamicProperty('jsp:v')]);
            log('bytes', () => sword.getDynamicPropertyTotalByteCount());
            const apple = new ItemStack('minecraft:apple', 1);
            log('apple', () => apple.setDynamicProperty('jsp:a', 1));
            log('apple ids', () => apple.getDynamicPropertyIds());
            sword.clearDynamicProperties();
            log('cleared', () => sword.getDynamicPropertyIds());`);
        expect(lines).toEqual([
            'get [3,{"x":1,"y":2,"z":3}]',
            `bytes ${5 + 1 + 8 + (5 + 1 + 12)}`,
            'apple ! UnsupportedFunctionalityError: Unsupported functionality: Cannot set dynamic properties on stackable items.',
            'apple ids []',
            'cleared []'
        ]);
    });

    it('shares one scoreboard with the world, with BDS’s errors for a duplicate, an overflow and a removed objective', () => {
        const world = new MemoryWorld();
        const { lines } = run(
            `
            const board = world.scoreboard;
            const one = board.addObjective('one');
            log('display name', () => one.displayName);
            log('again', () => board.addObjective('one'));
            log('nobody', () => one.getScore('nobody'));
            one.setScore('fake', 5.75);
            log('score', () => one.getScore('fake'));
            log('add', () => one.addScore('fake', 3));
            one.setScore('edge', 2147483647);
            log('overflow', () => one.addScore('edge', 1));
            const stand = world.getDimension('overworld').spawnEntity('minecraft:armor_stand', { x: 0, y: -60, z: 0 });
            one.setScore(stand, 9);
            log('identity', () => [stand.scoreboardIdentity.type, stand.scoreboardIdentity === stand.scoreboardIdentity, stand.scoreboardIdentity.getEntity() === stand]);
            log('scores', () => one.getScores().map(({ participant, score }) => participant.type + ':' + score));
            log('set slot', () => board.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: one }));
            log('slot', () => board.getObjectiveAtDisplaySlot(DisplaySlotId.Sidebar).sortOrder);
            log('remove fake', () => [one.removeParticipant('fake'), one.removeParticipant('fake')]);
            log('remove', () => board.removeObjective(one));
            log('remove missing', () => board.removeObjective('one'));
            log('removed', () => [one.isValid, board.getObjectiveAtDisplaySlot(DisplaySlotId.Sidebar)]);
            log('removed score', () => one.getScore('fake'));`,
            world
        );
        expect(lines).toEqual([
            'display name "one"',
            "again ! Error: Failed to add objective 'one' as it is already being tracked.",
            "nobody ! Error: Failed to resolve identity for 'nobody'.",
            'score 5',
            'add 8',
            "overflow ! Error: Encountered an integer overflow when trying to modify objective score for participant 'edge'.",
            'identity ["Entity",true,true]',
            'scores ["FakePlayer:8","FakePlayer:2147483647","Entity:9"]',
            'set slot undefined',
            'slot 1',
            'remove fake [true,false]',
            'remove true',
            'remove missing ! Error: Failed to find the objective specified.',
            'removed [false,null]',
            "removed score ! Error: Failed to find objective 'one'."
        ]);
        expect(world.scoreboard.objectives()).toEqual([]);
    });
});
