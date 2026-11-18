import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test.helper';
import { MemoryWorld } from '../testing/memoryWorld.test.helper';
import { readScriptConfig, readScriptPack } from './pack';
import { WorldScripts } from './WorldScripts';

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Writes a pack declaring `@minecraft/server` 2.0.0 whose entry is `source`. */
const writePack = (source: string) => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-components-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name: 'components', uuid: '0c6b7f0e-2f47-4d36-9a35-6d9e2b8f4a01', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: '0c6b7f0e-2f47-4d36-9a35-6d9e2b8f4a02', entry: 'scripts/main.js' }],
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
import { BlockPermutation, DimensionTypes, EffectTypes, EquipmentSlot, ItemStack, StructureRotation, StructureSaveMode, system, world } from '@minecraft/server';
const show = (value) => value === undefined ? 'undefined' : JSON.stringify(value);
const log = (label, call) => {
    try { console.warn(label + ' ' + show(call())); } catch (error) { console.warn(label + ' ! ' + String(error)); }
};
const stack = (item) => item === undefined ? null : item.typeId + ' x' + item.amount;
`;

describe.skipIf(!scriptHostAvailable())("WorldScripts's structures, entity components, slots and interactions", () => {
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
                error: (line: string) => lines.push(`error ${line.replace(/^\[Scripting\] \[components\] /, '')}`)
            },
            seed: 1n
        });
        running.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        for (let tick = 0; tick < ticks; tick++) scripts.flush();
        return { world, lines, scripts };
    };

    it('copies, reads, writes, places, saves and deletes structures with the errors BDS gives', () => {
        const { lines, world } = start(`
            world.afterEvents.worldLoad.subscribe(() => {
                const overworld = world.getDimension('overworld');
                const manager = world.structureManager;
                overworld.getBlock({ x: 1, y: -60, z: 1 }).setType('minecraft:stone');
                overworld.getBlock({ x: 3, y: -60, z: 2 }).setPermutation(BlockPermutation.resolve('minecraft:oak_log', { pillar_axis: 'x' }));
                const permutation = (found) => found === undefined ? null : found.type.id + ' ' + JSON.stringify(found.getAllStates());
                log('same manager', () => world.structureManager === manager);
                log('get unknown', () => manager.get('jsp:missing') ?? null);
                log('delete unknown', () => manager.delete('jsp:missing'));
                log('create', () => {
                    const made = manager.createFromWorld('jsp:copy', overworld, { x: 3, y: -59, z: 2 }, { x: 1, y: -60, z: 1 });
                    return [made.id, made.size, made.isValid, made === manager.get('jsp:copy')];
                });
                log('in use', () => manager.createFromWorld('jsp:copy', overworld, { x: 1, y: -60, z: 1 }, { x: 1, y: -60, z: 1 }));
                log('no namespace', () => manager.createFromWorld('bare', overworld, { x: 1, y: -60, z: 1 }, { x: 1, y: -60, z: 1 }));
                const copy = manager.get('jsp:copy');
                log('block 0 0 0', () => permutation(copy.getBlockPermutation({ x: 0, y: 0, z: 0 })));
                log('block 2 0 1', () => permutation(copy.getBlockPermutation({ x: 2, y: 0, z: 1 })));
                log('outside', () => copy.getBlockPermutation({ x: 3, y: 0, z: 0 }));
                log('set block', () => {
                    copy.setBlockPermutation({ x: 2, y: 1, z: 0 }, BlockPermutation.resolve('minecraft:dirt'));
                    return permutation(copy.getBlockPermutation({ x: 2, y: 1, z: 0 }));
                });
                log('set none', () => {
                    copy.setBlockPermutation({ x: 2, y: 1, z: 0 });
                    return permutation(copy.getBlockPermutation({ x: 2, y: 1, z: 0 }));
                });
                log('place', () => {
                    manager.place('jsp:copy', overworld, { x: 6, y: -60, z: 1 });
                    return [overworld.getBlock({ x: 6, y: -60, z: 1 }).typeId, overworld.getBlock({ x: 8, y: -60, z: 2 }).typeId];
                });
                log('place rotated', () => {
                    manager.place(copy, overworld, { x: 6, y: -60, z: 6 }, { rotation: StructureRotation.Rotate90 });
                    const log = overworld.getBlock({ x: 6, y: -60, z: 8 });
                    return [overworld.getBlock({ x: 7, y: -60, z: 6 }).typeId, log.typeId, log.permutation.getState('pillar_axis')];
                });
                log('place without blocks', () => {
                    overworld.getBlock({ x: 6, y: -60, z: 11 }).setType('minecraft:dirt');
                    manager.place('jsp:copy', overworld, { x: 6, y: -60, z: 11 }, { includeBlocks: false });
                    return overworld.getBlock({ x: 6, y: -60, z: 11 }).typeId;
                });
                log('place unknown', () => manager.place('jsp:missing', overworld, { x: 6, y: -60, z: 1 }));
                log('save as', () => copy.saveAs('jsp:saved', StructureSaveMode.Memory).size);
                log('empty', () => permutation(manager.createEmpty('jsp:empty', { x: 2, y: 2, z: 2 }).getBlockPermutation({ x: 1, y: 1, z: 1 })));
                log('ids', () => manager.getWorldStructureIds());
                log('delete', () => manager.delete(copy));
                log('after delete', () => [copy.isValid, manager.get('jsp:copy') ?? null]);
                log('size after delete', () => copy.size);
            });`);
        expect(lines).toEqual([
            'same manager true',
            'get unknown null',
            'delete unknown false',
            'create ["jsp:copy",{"x":3,"y":2,"z":2},true,true]',
            "in use ! InvalidArgumentError: Invalid value passed to argument [0]. Structure with identifier 'jsp:copy' already exists.",
            'no namespace ! InvalidArgumentError: Invalid value passed to argument [0]. Invalid or missing namespace.',
            'block 0 0 0 "minecraft:stone {}"',
            'block 2 0 1 "minecraft:oak_log {\\"pillar_axis\\":\\"x\\"}"',
            'outside ! InvalidArgumentError: Invalid value passed to argument [0]. The provided location (3, 0, 0) is outside the structure bounds (3, 2, 2).',
            'set block "minecraft:dirt {}"',
            'set none null',
            'place ["minecraft:stone","minecraft:oak_log"]',
            'place rotated ["minecraft:stone","minecraft:oak_log","z"]',
            'place without blocks "minecraft:dirt"',
            'place unknown ! InvalidStructureError: Structure does not exist.',
            'save as {"x":3,"y":2,"z":2}',
            'empty null',
            'ids ["jsp:copy","jsp:saved","jsp:empty"]',
            'delete true',
            'after delete [false,null]',
            'size after delete ! InvalidStructureError: Structure does not exist.'
        ]);
        expect(world.structures.ids()).toEqual(['jsp:saved', 'jsp:empty']);
    });

    it("reads and writes a player's equipment and attributes, and a container's slots in place", () => {
        const world = new MemoryWorld();
        world.join('Tester');
        const { lines } = start(
            `
            log('baked in early execution', () => DimensionTypes.getAll()[0].typeId);
            world.afterEvents.worldLoad.subscribe(() => {
                const [player] = world.getAllPlayers();
                const pig = world.getDimension('overworld').spawnEntity('minecraft:pig', { x: 0, y: -60, z: 0 });
                const equippable = player.getComponent('equippable');
                log('typeId', () => [equippable.typeId, player.hasComponent('minecraft:equippable'), pig.getComponent('equippable') ?? null]);
                log('set head', () => equippable.setEquipment(EquipmentSlot.Head, new ItemStack('minecraft:iron_helmet')));
                log('head', () => stack(equippable.getEquipment(EquipmentSlot.Head)));
                log('set mainhand', () => equippable.setEquipment(EquipmentSlot.Mainhand, new ItemStack('minecraft:apple', 3)));
                log('mainhand in the inventory', () => stack(player.getComponent('inventory').container.getItem(0)));
                log('apple on the chest', () => equippable.setEquipment(EquipmentSlot.Chest, new ItemStack('minecraft:apple')));
                log('armor', () => equippable.totalArmor);
                log('feet slot', () => {
                    const slot = equippable.getEquipmentSlot(EquipmentSlot.Feet);
                    const before = slot.hasItem();
                    slot.setItem(new ItemStack('minecraft:leather_boots'));
                    return [before, stack(equippable.getEquipment(EquipmentSlot.Feet)), equippable.totalArmor];
                });
                log('bad slot', () => equippable.getEquipment('Pocket'));

                const health = pig.getComponent('health');
                log('health', () => [health.typeId, health.currentValue, health.defaultValue, health.effectiveMin, health.effectiveMax]);
                log('movement', () => pig.getComponent('minecraft:movement').currentValue);
                log('no attribute', () => pig.getComponent('underwater_movement') ?? null);
                log('set 4', () => [health.setCurrentValue(4), health.currentValue]);
                log('set 50', () => health.setCurrentValue(50));
                log('reset to max', () => { health.resetToMaxValue(); return health.currentValue; });
                log('reset to min', () => { health.resetToMinValue(); return health.currentValue; });
                log('reset to default', () => { health.resetToDefaultValue(); return health.currentValue; });

                const container = player.getComponent('inventory').container;
                log('empty slot', () => { const slot = container.getSlot(5); return [slot.hasItem(), slot.isValid, slot.getItem() ?? null]; });
                log('empty typeId', () => container.getSlot(5).typeId);
                log('past the end', () => container.getSlot(36));
                const slot = container.getSlot(5);
                log('set item', () => { slot.setItem(new ItemStack('minecraft:stone', 4)); return [slot.typeId, slot.amount, stack(container.getItem(5))]; });
                log('amount', () => { slot.amount = 9; return stack(container.getItem(5)); });
                log('amount past the stack', () => { slot.amount = 70; return slot.amount; });
                log('name', () => { slot.nameTag = 'Rock'; return [slot.nameTag, container.getItem(5).nameTag]; });
                log('lore', () => { slot.setLore(['one']); return [slot.getLore(), container.getItem(5).getLore()]; });
                log('follows the container', () => { container.setItem(5, new ItemStack('minecraft:apple')); return [slot.typeId, slot.maxAmount, slot.isStackable]; });
                log('cleared', () => { slot.setItem(); return slot.hasItem(); });
                log('dimension types', () => [DimensionTypes.getAll().map((type) => type.typeId), DimensionTypes.get('nether').typeId, DimensionTypes.get('jsp:none') ?? null]);
            });`,
            world
        );
        expect(lines).toEqual([
            'baked in early execution "minecraft:overworld"',
            'typeId ["minecraft:equippable",true,null]',
            'set head true',
            'head "minecraft:iron_helmet x1"',
            'set mainhand true',
            'mainhand in the inventory "minecraft:apple x3"',
            'apple on the chest false',
            'armor 2',
            'feet slot [false,"minecraft:leather_boots x1",3]',
            'bad slot ! TypeError: Native type conversion failed. Function argument [0] expected type: EquipmentSlot',
            'health ["minecraft:health",10,10,0,10]',
            'movement 0.25',
            'no attribute null',
            'set 4 [true,4]',
            'set 50 ! ArgumentOutOfBoundsError: Unsupported or out of bounds value passed to function argument [0]: value, Value: 50, Argument bounds: [0, 10]',
            'reset to max 10',
            'reset to min 0',
            'reset to default 10',
            'empty slot [false,true,null]',
            'empty typeId ! InvalidContainerSlotError: The container slot is either empty or is no longer loaded.',
            "past the end ! Error: Invalid container slot provided '36'. Maximum slot is '35'.",
            'set item ["minecraft:stone",4,"minecraft:stone x4"]',
            'amount "minecraft:stone x9"',
            'amount past the stack 64',
            'name ["Rock","Rock"]',
            'lore [["one"],["one"]]',
            'follows the container ["minecraft:apple",64,true]',
            'cleared false',
            'dimension types [["minecraft:overworld","minecraft:nether","minecraft:the_end"],"minecraft:nether",null]'
        ]);
    });

    it('raises the interaction before-events, which can cancel a click, and the after-events for one that went on', () => {
        const world = new MemoryWorld();
        const player = world.join('Tester');
        const { lines, scripts } = start(
            `
            let cancel = true;
            world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
                console.warn('before block ' + [event.player.name, event.block.typeId, event.blockFace, JSON.stringify(event.faceLocation), stack(event.itemStack), event.isFirstEvent].join(' '));
                event.cancel = cancel;
                cancel = false;
            });
            world.afterEvents.playerInteractWithBlock.subscribe((event) =>
                console.warn('after block ' + [event.block.location.y, stack(event.beforeItemStack), stack(event.itemStack)].join(' '))
            );
            world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
                console.warn('before entity ' + [event.player.name, event.target.typeId, stack(event.itemStack)].join(' '));
                event.cancel = event.itemStack === undefined;
            });
            world.afterEvents.playerInteractWithEntity.subscribe((event) =>
                console.warn('after entity ' + [event.target.typeId, stack(event.beforeItemStack), stack(event.itemStack)].join(' '))
            );`,
            world
        );
        const block = { dimension: 'minecraft:overworld', x: 0, y: -61, z: 0 };
        const click = { player, block, face: 'Up', faceLocation: { x: 0.5, y: 1, z: 0.5 } } as const;
        expect(world.interactWithBlock(click)).toBe(false);
        expect(world.interactWithBlock({ ...click, item: { typeId: 'minecraft:stone', amount: 2 } })).toBe(true);
        const pig = world.spawnEntity('minecraft:overworld', 'minecraft:pig', { x: 0, y: -60, z: 0 });
        const target = { id: pig, typeId: 'minecraft:pig' };
        expect(world.interactWithEntity({ player, target })).toBe(false);
        expect(
            world.interactWithEntity({
                player,
                target,
                item: { typeId: 'minecraft:apple', amount: 3 },
                itemAfter: { typeId: 'minecraft:apple', amount: 2 }
            })
        ).toBe(true);
        scripts.flush();
        expect(lines).toEqual([
            'before block Tester minecraft:grass_block Up {"x":0.5,"y":1,"z":0.5}  true',
            'before block Tester minecraft:grass_block Up {"x":0.5,"y":1,"z":0.5} minecraft:stone x2 true',
            'before entity Tester minecraft:pig ',
            'before entity Tester minecraft:pig minecraft:apple x3',
            'after block -61 minecraft:stone x2 ',
            'after entity minecraft:pig minecraft:apple x3 minecraft:apple x2'
        ]);
    });

    it('lists and finds effect types, tells when an effect is gone, and spawns a particle for one player', () => {
        const world = new MemoryWorld();
        const player = world.join('Tester');
        const { lines } = start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const [player] = world.getAllPlayers();
                log('get', () => [EffectTypes.get('speed').getName(), EffectTypes.get('jsp:none') ?? null]);
                log('all', () => EffectTypes.getAll().map((type) => type.getName()).sort());
                log('isValid', () => {
                    const effect = player.addEffect('speed', 200);
                    const before = effect.isValid;
                    player.removeEffect('speed');
                    return [before, effect.isValid];
                });
                log('particle', () => player.spawnParticle('minecraft:basic_flame_particle', player.location));
            });`,
            world
        );
        expect(lines).toEqual([
            'get ["minecraft:speed",null]',
            'all ["minecraft:haste","minecraft:slowness","minecraft:speed"]',
            'isValid [true,false]',
            'particle undefined'
        ]);
        expect(world.particles).toEqual([`minecraft:basic_flame_particle  > ${player}`]);
    });
});
