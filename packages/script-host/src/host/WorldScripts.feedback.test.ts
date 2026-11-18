import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test.helper';
import { MemoryWorld } from '../testing/memoryWorld.test.helper';
import { JobQueue } from './jobs';
import { effectDisplayName } from './serverFeedback';
import { readScriptConfig, readScriptPack } from './pack';
import { WorldScripts } from './WorldScripts';

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Writes a pack declaring `@minecraft/server` 2.0.0 whose entry is `source`. */
const writePack = (source: string) => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-feedback-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name: 'feedback', uuid: '5f0b3c39-49c1-4c1c-9f0e-0f5b1f1d6f01', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: '5f0b3c39-49c1-4c1c-9f0e-0f5b1f1d6f02', entry: 'scripts/main.js' }],
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
import { ItemStack, MolangVariableMap, system, world } from '@minecraft/server';
const show = (value) => value === undefined ? 'undefined' : JSON.stringify(value);
const log = (label, call) => {
    try { console.warn(label + ' ' + show(call())); } catch (error) { console.warn(label + ' ! ' + String(error)); }
};
`;

describe('JobQueue', () => {
    it('steps every job once, then runs each to its end within the budget, in the order they were queued', () => {
        const queue = new JobQueue<{ name: string; left: number }>();
        const order: string[] = [];
        queue.add({ name: 'a', left: 3 });
        queue.add({ name: 'b', left: 2 });
        const released: string[] = [];
        const steps = queue.run(
            (job) => {
                order.push(job.name);
                job.left--;
                return job.left > 0 ? 'more' : 'done';
            },
            () => true,
            (job) => released.push(job.name)
        );
        expect(order).toEqual(['a', 'b', 'a', 'a', 'b']);
        expect(steps).toBe(5);
        expect(released).toEqual(['a', 'b']);
        expect(queue.size).toBe(0);
    });

    it('leaves what the budget does not reach for the next run, and a job queued while running waits', () => {
        const queue = new JobQueue<string>();
        let budget = 3;
        const ran: string[] = [];
        queue.add('forever');
        queue.add('other');
        queue.run(
            (job) => {
                ran.push(job);
                if (job === 'other' && ran.length === 2) queue.add('late');
                return 'more';
            },
            () => budget-- > 0,
            () => {}
        );
        // One step each, then three more steps of the first job; the second waits for the next tick.
        expect(ran).toEqual(['forever', 'other', 'forever', 'forever', 'forever']);
        expect(queue.size).toBe(3);
    });

    it('drops a job cleared while it runs without releasing it twice', () => {
        const queue = new JobQueue<string>();
        const released: string[] = [];
        const id = queue.add('self-clearing');
        queue.run(
            () => {
                const cleared = queue.clear(id);
                if (cleared !== undefined) released.push(cleared);
                return 'done';
            },
            () => true,
            (job) => released.push(job)
        );
        expect(released).toEqual(['self-clearing']);
    });
});

describe('effectDisplayName', () => {
    it("writes the effect's English name and its potency from II up in Roman numerals", () => {
        expect(effectDisplayName({ typeId: 'minecraft:speed', amplifier: 0 })).toBe('Speed');
        expect(effectDisplayName({ typeId: 'minecraft:slowness', amplifier: 2 })).toBe('Slowness III');
        expect(effectDisplayName({ typeId: 'minecraft:speed', amplifier: 3 })).toBe('Speed IV');
        expect(effectDisplayName({ typeId: 'minecraft:fire_resistance', amplifier: 8 })).toBe('Fire Resistance IX');
        expect(effectDisplayName({ typeId: 'minecraft:village_hero', amplifier: 0 })).toBe('Hero of the Village');
    });
});

describe.skipIf(!scriptHostAvailable())("WorldScripts's jobs, feedback, effects, containers and player actions", () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const running: WorldScripts[] = [];
    afterEach(() => {
        for (const scripts of running.splice(0)) scripts.shutdown();
    });

    /** Loads `source` at the pack's top level and runs `ticks` flushes. */
    const start = (source: string, world = new MemoryWorld(), ticks = 1) => {
        const lines: string[] = [];
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs: [writePack(`${PRELUDE}\n${source}`)],
            config: readScriptConfig(undefined),
            log: {
                info: () => {},
                warn: (line: string) => lines.push(line.replace(/^\[Scripting\] /, '')),
                error: (line: string) => lines.push(`error ${line.replace(/^\[Scripting\] \[feedback\] /, '')}`)
            },
            seed: 1n
        });
        running.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        for (let tick = 0; tick < ticks; tick++) scripts.flush();
        return { world, lines, scripts };
    };

    it('advances a job from the next tick, one step for every job first, before the tick’s tasks', () => {
        const { lines } = start(
            `
            function* steps(name, count) {
                for (let step = 1; step <= count; step++) { console.warn(system.currentTick + ' ' + name + ' ' + step); yield; }
                console.warn(system.currentTick + ' ' + name + ' done');
            }
            world.afterEvents.worldLoad.subscribe(() => {
                system.runJob(steps('A', 2));
                system.runJob(steps('B', 1));
                const cleared = system.runJob(steps('C', 1));
                system.clearJob(cleared);
                let count = 0;
                const own = system.runJob((function* () { for (;;) { count++; console.warn(system.currentTick + ' own ' + count); if (count === 2) system.clearJob(own); yield; } })());
                system.runJob((function* () { yield; throw new Error('job failed'); })());
                system.runTimeout(() => console.warn(system.currentTick + ' timeout'), 1);
                log('function', () => system.runJob(() => {}));
            });`,
            new MemoryWorld(),
            3
        );
        expect(lines.filter((line) => !line.startsWith('error') || line.includes('job failed'))).toEqual([
            'function ! TypeError: Native type conversion failed. Function argument [0] expected type: Generator<void, void, void>',
            '1 A 1',
            '1 B 1',
            '1 own 1',
            '1 A 2',
            '1 A done',
            '1 B done',
            '1 own 2',
            expect.stringContaining('error Error: job failed'),
            '1 timeout'
        ]);
    });

    it('sends an entity event only to the subscribers whose EntityEventOptions name the entity and its type', () => {
        const { lines } = start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const overworld = world.getDimension('overworld');
                const pig = overworld.spawnEntity('minecraft:pig', { x: 0, y: -60, z: 0 });
                const stand = overworld.spawnEntity('minecraft:armor_stand', { x: 2, y: -60, z: 0 });
                const hurt = (label, options) =>
                    world.afterEvents.entityHurt.subscribe((event) => console.warn(label + ' ' + event.hurtEntity.typeId), options);
                hurt('all');
                hurt('pig type', { entityTypes: ['minecraft:pig'] });
                hurt('pig without namespace', { entityTypes: ['pig'] });
                hurt('stand entity', { entities: [stand] });
                hurt('pig entity and stand type', { entities: [pig], entityTypes: ['minecraft:armor_stand'] });
                hurt('empty', { entities: [], entityTypes: [] });
                world.afterEvents.entityDie.subscribe((event) => console.warn('die pig ' + event.deadEntity.typeId), { entityTypes: ['minecraft:pig'] });
                system.run(() => { pig.applyDamage(2); stand.applyDamage(2); });
            });`,
            new MemoryWorld(),
            3
        );
        expect(lines).toEqual([
            'all minecraft:pig',
            'pig type minecraft:pig',
            'all minecraft:armor_stand',
            'stand entity minecraft:armor_stand'
        ]);
    });

    it("shows titles and plays sounds through the world's verbs, and fails on a player who left", () => {
        const world = new MemoryWorld();
        const id = world.join('Steve');
        const { lines } = start(
            `
            system.run(() => {
                const [player] = world.getAllPlayers();
                const screen = player.onScreenDisplay;
                log('same object', () => player.onScreenDisplay === screen);
                log('title', () => screen.setTitle('Hello', { fadeInDuration: 1, stayDuration: 2, fadeOutDuration: 3, subtitle: { text: 'sub' } }));
                log('negative stay', () => screen.setTitle('x', { fadeInDuration: 0, stayDuration: -1, fadeOutDuration: 0 }));
                log('subtitle', () => screen.updateSubtitle('later'));
                log('action bar', () => screen.setActionBar(['a', { text: 'b' }]));
                log('sound', () => { const sound = player.playSound('random.orb', { volume: 0.5 }); return [sound.id, sound.soundEventId, sound.recipient === player]; });
                log('dimension sound', () => player.dimension.playSound('random.pop', { x: 1, y: 2, z: 3 }).id);
                log('negative volume', () => player.dimension.playSound('random.pop', { x: 1, y: 2, z: 3 }, { volume: -1 }));
                log('sneaking', () => { player.isSneaking = true; return player.isSneaking; });
                system.run(() => log('after leaving', () => screen.setTitle('gone')));
            });`,
            world
        );
        world.leave(id);
        running[0]?.flush();
        expect(lines).toEqual([
            'same object true',
            'title undefined',
            'negative stay ! ArgumentOutOfBoundsError: Unsupported or out of bounds value passed to function argument [0]: stayDuration, Value: -1, Argument min: 0',
            'subtitle undefined',
            'action bar undefined',
            'sound ["1","random.orb",true]',
            'dimension sound "2"',
            'negative volume ! PropertyOutOfBoundsError: Unsupported or out of bounds value set on Property: volume, Value: -1, Property min: 0',
            'sneaking true',
            "after leaving ! InvalidEntityError: Failed to call function 'Player' due to Entity being invalid (has the Entity been removed?)."
        ]);
        expect(world.titles).toEqual([
            `${id} times 1 2 3`,
            `${id} subtitle sub`,
            `${id} title Hello`,
            `${id} subtitle later`,
            `${id} actionbar ab`
        ]);
        expect(world.sounds.map((sound) => [sound.sound, sound.volume, sound.player])).toEqual([
            ['random.orb', 0.5, id],
            ['random.pop', 1, undefined]
        ]);
    });

    it("adds, reads and removes an entity's effects, with BDS's errors and names", () => {
        const { lines } = start(`
            system.run(() => {
                const pig = world.getDimension('overworld').spawnEntity('minecraft:pig', { x: 0, y: -60, z: 0 });
                const effect = (found) => found === undefined ? null : [found.typeId, found.amplifier, found.duration, found.displayName];
                log('add', () => effect(pig.addEffect('speed', 200)));
                log('weaker', () => effect(pig.addEffect('speed', 50)));
                log('stronger', () => effect(pig.addEffect('minecraft:speed', 60, { amplifier: 3 })));
                log('unknown', () => pig.addEffect('jsp:nothing', 20));
                log('amplifier', () => pig.addEffect('speed', 20, { amplifier: 300 }));
                log('get', () => effect(pig.getEffect('speed')));
                log('absent', () => effect(pig.getEffect('slowness')));
                pig.addEffect('slowness', 10, { amplifier: 2 });
                log('all', () => pig.getEffects().map(effect));
                log('remove', () => pig.removeEffect('slowness'));
                log('remove again', () => pig.removeEffect('slowness'));
            });`);
        expect(lines).toEqual([
            'add ["minecraft:speed",0,200,"Speed"]',
            'weaker ["minecraft:speed",0,200,"Speed"]',
            'stronger ["minecraft:speed",3,60,"Speed IV"]',
            'unknown ! InvalidArgumentError: Invalid type passed to argument [0]. Expected type: effectType',
            'amplifier ! ArgumentOutOfBoundsError: Unsupported or out of bounds value passed to function argument [2]: amplifier, Value: 300, Argument bounds: [0, 255]',
            'get ["minecraft:speed",3,60,"Speed IV"]',
            'absent null',
            'all [["minecraft:speed",3,60,"Speed IV"],["minecraft:slowness",2,10,"Slowness III"]]',
            'remove true',
            'remove again false'
        ]);
    });

    it('carries a MolangVariableMap to a particle as the packet writes its variables', () => {
        const { world, lines } = start(`
            system.run(() => {
                const map = new MolangVariableMap();
                map.setFloat('variable.size', 2);
                map.setColorRGB('variable.color', { red: 1, green: 0.5, blue: 0 });
                map.setFloat('variable.size', 3);
                log('bad color', () => map.setColorRGB('variable.color', { x: 1, y: 0, z: 0 }));
                log('particle', () => world.getDimension('overworld').spawnParticle('jsp:flame', { x: 0, y: -59, z: 0 }, map));
                log('unloaded', () => world.getDimension('overworld').spawnParticle('jsp:flame', { x: 5000, y: -59, z: 5000 }));
            });`);
        expect(lines).toEqual([
            "bad color ! TypeError: Native setter cannot be assigned null or undefined. Interface property ['blue'] expected type: number (failed parsing interface to Function argument [1]).",
            'particle undefined',
            'unloaded ! LocationInUnloadedChunkError: Trying to access location (5000.0, -59.0, 5000.0) which is not in a chunk currently loaded and ticking.'
        ]);
        expect(world.particles).toEqual([
            'jsp:flame [{"name":"variable.size","value":{"type":"float","value":3}},' +
                '{"name":"variable.color","value":{"type":"member_array","value":[' +
                '{"name":".r","value":{"type":"float","value":1}},{"name":".g","value":{"type":"float","value":0.5}},' +
                '{"name":".b","value":{"type":"float","value":0}}]}}]'
        ]);
    });

    it("reads and writes a chest's container and an item stack's durability", () => {
        const { lines } = start(`
            system.run(() => {
                const overworld = world.getDimension('overworld');
                const chest = overworld.getBlock({ x: 1, y: -60, z: 1 });
                chest.setType('minecraft:chest');
                const stone = overworld.getBlock({ x: 2, y: -60, z: 1 });
                stone.setType('minecraft:stone');
                log('component', () => chest.getComponent('inventory').typeId);
                log('has', () => [chest.hasComponent('minecraft:inventory'), stone.hasComponent('inventory')]);
                log('stone', () => stone.getComponent('inventory'));
                log('block', () => chest.getComponent('inventory').block.typeId);
                const container = chest.getComponent('minecraft:inventory').container;
                log('size', () => container.size);
                container.setItem(0, new ItemStack('minecraft:apple', 5));
                log('add', () => container.addItem(new ItemStack('minecraft:apple', 62)));
                log('slots', () => [0, 1].map((slot) => container.getItem(slot)?.amount));
                log('new object', () => overworld.getBlock({ x: 1, y: -60, z: 1 }).getComponent('inventory').container.getItem(1).amount);
                const sword = new ItemStack('minecraft:diamond_sword');
                const durability = sword.getComponent('durability');
                log('durability', () => [durability.typeId, durability.maxDurability, durability.damage, sword.hasComponent('durability')]);
                durability.damage = 10;
                log('damage', () => [durability.damage, sword.getComponent('minecraft:durability').damage]);
                log('too much', () => { durability.damage = 5000; });
                log('apple', () => [new ItemStack('minecraft:apple').getComponent('durability'), new ItemStack('minecraft:apple').hasComponent('durability')]);
                container.setItem(2, sword);
                log('kept damage', () => container.getItem(2).getComponent('durability').damage);
                chest.setType('minecraft:air');
                log('removed', () => container.isValid);
                log('removed size', () => container.size);
            });`);
        expect(lines).toEqual([
            'component "minecraft:inventory"',
            'has [true,false]',
            'stone undefined',
            'block "minecraft:chest"',
            'size 27',
            'add undefined',
            'slots [64,3]',
            'new object 3',
            'durability ["minecraft:durability",1561,0,true]',
            'damage [10,10]',
            "too much ! Error: Invalid damage value '5000' set on item 'minecraft:diamond_sword'. Damage values cannot be greater than maxDurability.",
            'apple [null,false]',
            'kept damage 10',
            'removed false',
            "removed size ! Error: Failed to get property 'size'."
        ]);
    });

    it('lets a script cancel a player’s item use and block break, whose after-events follow only what went on', () => {
        const world = new MemoryWorld();
        const id = world.join('Steve');
        const { lines } = start(
            `
            let cancel = true;
            world.beforeEvents.itemUse.subscribe((event) => {
                console.warn('before use ' + event.itemStack.typeId + ' ' + event.source.name);
                event.cancel = cancel;
            });
            world.afterEvents.itemUse.subscribe((event) => console.warn('after use ' + event.itemStack.typeId));
            world.beforeEvents.playerBreakBlock.subscribe((event) => {
                console.warn('before break ' + event.block.typeId + ' ' + event.player.name + ' ' + event.dimension.id);
                event.cancel = cancel;
                cancel = false;
            });
            world.afterEvents.playerBreakBlock.subscribe((event) =>
                console.warn('after break ' + event.block.typeId + ' ' + event.brokenBlockPermutation.type.id));`,
            world
        );
        const stick = { typeId: 'minecraft:stick', amount: 1 };
        expect(world.useItem(id, stick)).toBe(false);
        expect(world.breakBlock(id, 'minecraft:overworld', { x: 0, y: -61, z: 0 })).toBe(false);
        expect(world.useItem(id, stick)).toBe(true);
        expect(world.breakBlock(id, 'minecraft:overworld', { x: 0, y: -61, z: 0 })).toBe(true);
        running[0]?.flush();
        expect(lines).toEqual([
            'before use minecraft:stick Steve',
            'before break minecraft:grass_block Steve minecraft:overworld',
            'before use minecraft:stick Steve',
            'before break minecraft:grass_block Steve minecraft:overworld',
            'after use minecraft:stick',
            'after break minecraft:air minecraft:grass_block'
        ]);
    });
});
