import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test.helper';
import { MemoryWorld } from '../testing/memoryWorld.test.helper';
import type { ScriptPack } from './pack';
import { readScriptConfig, readScriptPack } from './pack';
import type { ScriptBlockLocation, ScriptComponentSink } from './world';
import { WorldScripts } from './WorldScripts';

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
const writePack = (source: string, version = '2.0.0'): ScriptPack => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-custom-content-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name: 'probe', uuid: 'aac52733-889b-4c87-abcb-f064ea7735a2', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: '13f251b3-41c9-4271-b2d1-d4abde28890b', entry: 'scripts/main.js' }],
            dependencies: [{ module_name: '@minecraft/server', version }]
        })
    );
    writeFileSync(join(directory, 'scripts', 'main.js'), source);
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error('the pack has a script module');
    return pack;
};

/** Where the block hooks of these tests fire: the origin of the overworld's flat ground. */
const AT: ScriptBlockLocation = { dimension: 'minecraft:overworld', x: 0, y: -60, z: 0 };

describe.skipIf(!scriptHostAvailable())('WorldScripts custom content', () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const runtimes: WorldScripts[] = [];
    afterEach(() => {
        for (const runtime of runtimes.splice(0)) runtime.shutdown();
    });

    const start = (source: string, version = '2.0.0') => {
        const world = new MemoryWorld();
        const log = new Log();
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs: [writePack(source, version)],
            config: readScriptConfig(undefined),
            log,
            seed: 1n
        });
        runtimes.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        return { scripts, world, log };
    };

    const COMMANDS = `import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, system, world } from '@minecraft/server';
        const describe = (value) => value === undefined ? 'undefined'
            : Array.isArray(value) ? value.map(describe)
            : typeof value !== 'object' ? value
            : typeof value.typeId === 'string' ? 'entity ' + value.typeId
            : typeof value.id === 'string' ? value.constructor.name + ' ' + value.id
            : JSON.stringify(value);
        system.beforeEvents.startup.subscribe(({ customCommandRegistry: registry }) => {
            registry.registerEnum('jsp:color', ['red', 'green']);
            registry.registerCommand(
                {
                    name: 'jsp:echo',
                    description: 'Echoes',
                    permissionLevel: CommandPermissionLevel.GameDirectors,
                    cheatsRequired: true,
                    mandatoryParameters: [
                        { name: 'text', type: CustomCommandParamType.String },
                        { name: 'where', type: CustomCommandParamType.Location },
                        { name: 'who', type: CustomCommandParamType.EntitySelector },
                        { name: 'kind', type: CustomCommandParamType.ItemType }
                    ],
                    optionalParameters: [{ name: 'jsp:color', type: CustomCommandParamType.Enum }]
                },
                (origin, ...args) => {
                    console.warn(origin.sourceType + ' ' + JSON.stringify(args.map(describe)));
                    return { status: CustomCommandStatus.Success, message: 'echoed ' + args[0] };
                }
            );
            registry.registerCommand(
                { name: 'jsp:fail', description: 'Fails', permissionLevel: CommandPermissionLevel.Any },
                () => ({ status: CustomCommandStatus.Failure, message: 'it failed' })
            );
            registry.registerCommand(
                { name: 'jsp:throws', description: 'Throws', permissionLevel: CommandPermissionLevel.Any },
                () => { throw new Error('the callback threw'); }
            );
            registry.registerCommand(
                { name: 'jsp:restricted', description: 'Writes', permissionLevel: CommandPermissionLevel.Any },
                () => { world.getDimension('overworld').setWeather('Rain'); }
            );
            registry.registerCommand(
                { name: 'jsp:Shout', description: 'Upper case', permissionLevel: CommandPermissionLevel.Any },
                () => undefined
            );
            for (const [label, register] of [
                ['again', () => registry.registerCommand({ name: 'jsp:fail', description: '', permissionLevel: 0 }, () => {})],
                ['bare', () => registry.registerCommand({ name: 'bare', description: '', permissionLevel: 0 }, () => {})],
                ['minecraft', () => registry.registerEnum('minecraft:shade', ['dark'])],
                ['enum again', () => registry.registerEnum('jsp:color', ['red'])],
                ['missing enum', () => registry.registerCommand({ name: 'jsp:missing', description: '', permissionLevel: 0,
                    mandatoryParameters: [{ name: 'jsp:nothing', type: CustomCommandParamType.Enum }] }, () => {})]
            ]) {
                try { register(); } catch (error) { console.warn(label + ': ' + error); }
            }
            system.run(() => {
                try { registry.registerCommand({ name: 'jsp:late', description: '', permissionLevel: 0 }, () => {}); }
                catch (error) { console.warn('late: ' + error); }
            });
        });`;

    it('puts the commands a pack registered in startup into the world, without the one BDS drops', () => {
        const { world, log } = start(COMMANDS);
        expect(world.commandSet?.commands.map((command) => command.name)).toEqual([
            'jsp:echo',
            'jsp:fail',
            'jsp:throws',
            'jsp:restricted'
        ]);
        expect(world.commandSet?.commands[0]).toEqual({
            name: 'jsp:echo',
            description: 'Echoes',
            permissionLevel: 1,
            cheatsRequired: true,
            mandatoryParameters: [
                { name: 'text', type: 'String' },
                { name: 'where', type: 'Location' },
                { name: 'who', type: 'EntitySelector' },
                { name: 'kind', type: 'ItemType' }
            ],
            optionalParameters: [{ name: 'jsp:color', type: 'Enum' }]
        });
        expect(world.commandSet?.enums).toEqual([{ name: 'jsp:color', values: ['red', 'green'] }]);
        expect(log.lines).toContain(
            "error [Commands] Register Command <jsp:Shout> | Keywords in commands need to be lower case. 'jsp:Shout' was not registered."
        );
        expect(log.lines).toContain(
            "error [Commands] Register Command <jsp:Shout> Alias <Shout> | Keywords in commands need to be lower case. 'jsp:Shout' was not registered."
        );
    });

    it('throws the errors BDS throws for a registration it refuses', () => {
        const { scripts, log } = start(COMMANDS);
        scripts.flush();
        expect(log.printed()).toEqual([
            "again: CustomCommandError: Custom Command 'jsp:fail' was already registered.",
            "bare: NamespaceNameError: There was an error with name 'bare': string must be prefixed with a namespace (eg. namespace:value).",
            "minecraft: NamespaceNameError: There was an error with name 'minecraft:shade': string has invalid namespace (minecraft).",
            "enum again: CustomCommandError: Custom Command Enum 'jsp:color' was already registered.",
            'missing enum: CustomCommandError: Custom Command depends on one or more unknown enums [jsp:nothing].',
            'late: CustomCommandError: Custom Command registration failed outside of the ModuleStartup event.'
        ]);
    });

    it("runs a command's callback with its origin and arguments, and hands back its result", () => {
        const { world, log } = start(COMMANDS);
        const entity = world.spawnEntity('minecraft:overworld', 'minecraft:armor_stand', { x: 0, y: -60, z: 0 });
        const outcome = world.commandSet?.run('jsp:echo', { sourceType: 'Server' }, [
            'hi',
            { kind: 'location', location: { x: 1.5, y: 2, z: 3.5 } },
            { kind: 'entities', entities: [{ id: entity, typeId: 'minecraft:armor_stand' }] },
            { kind: 'itemType', id: 'minecraft:apple' },
            'green'
        ]);
        expect(outcome).toEqual({ status: 'success', message: 'echoed hi' });
        expect(log.printed()).toContain(
            'Server ["hi","{\\"x\\":1.5,\\"y\\":2,\\"z\\":3.5}",["entity minecraft:armor_stand"],"ItemType minecraft:apple","green"]'
        );
    });

    it('fails a command whose callback fails, throws or writes the world in restricted execution', () => {
        const { world, log } = start(COMMANDS);
        expect(world.commandSet?.run('jsp:fail', { sourceType: 'Server' }, [])).toEqual({
            status: 'failure',
            message: 'it failed'
        });
        expect(world.commandSet?.run('jsp:throws', { sourceType: 'Server' }, [])).toEqual({
            status: 'failure',
            message: 'the callback threw'
        });
        expect(log.lines.some((line) => line.startsWith('error [Scripting] [probe] Error: the callback threw'))).toBe(
            true
        );
        expect(world.commandSet?.run('jsp:restricted', { sourceType: 'Server' }, [])).toEqual({
            status: 'failure',
            message: 'Native function [Dimension::setWeather] cannot be used in restricted execution.'
        });
        expect(world.weather()).toBe('Clear');
    });

    it('takes its commands out of the world and registers them again on a reload', () => {
        const { scripts, world } = start(COMMANDS);
        const first = world.commandSet;
        scripts.reload();
        expect(world.commandRegistrations).toBe(2);
        expect(world.commandSet).not.toBe(first);
        expect(world.commandSet?.commands).toHaveLength(4);
        scripts.shutdown();
        expect(world.commandSet).toBeUndefined();
    });

    const COMPONENTS = `import { system } from '@minecraft/server';
        const record = (name) => (event, parameters) => {
            const kept = { class: event.constructor.name, params: parameters.params ?? null };
            if ('block' in event) kept.block = event.block.typeId + ' ' + JSON.stringify(event.block.location);
            if ('dimension' in event) kept.dimension = event.dimension.id;
            if ('previousBlock' in event) kept.previousBlock = event.previousBlock.type.id;
            if ('brokenBlockPermutation' in event) kept.broken = event.brokenBlockPermutation.type.id;
            if ('permutationToPlace' in event) kept.placing = event.permutationToPlace.type.id;
            if ('itemStack' in event) kept.item = event.itemStack?.typeId ?? null;
            if ('source' in event) kept.source = event.source.typeId;
            console.warn(name + ' ' + JSON.stringify(kept));
        };
        system.beforeEvents.startup.subscribe(({ blockComponentRegistry: blocks, itemComponentRegistry: items }) => {
            blocks.registerCustomComponent('jsp:recorder', {
                onPlace: record('onPlace'),
                onBreak: record('onBreak'),
                onTick: record('onTick'),
                beforeOnPlayerPlace(event, parameters) {
                    record('beforeOnPlayerPlace')(event, parameters);
                    try { event.dimension.setWeather('Rain'); } catch (error) { console.warn(String(error)); }
                    event.cancel = parameters.params?.refuse === true;
                }
            });
            items.registerCustomComponent('jsp:wand', { onUse: record('onUse') });
            for (const [label, register] of [
                ['again', () => blocks.registerCustomComponent('jsp:recorder', {})],
                ['bare', () => blocks.registerCustomComponent('recorder', {})],
                ['minecraft', () => items.registerCustomComponent('minecraft:wand', {})],
                ['item again', () => items.registerCustomComponent('jsp:wand', {})],
                ['not a function', () => blocks.registerCustomComponent('jsp:odd', { onPlace: 5 })]
            ]) {
                try { register(); } catch (error) { console.warn(label + ': ' + error); }
            }
            system.run(() => {
                try { blocks.registerCustomComponent('jsp:late', {}); } catch (error) { console.warn('late: ' + error); }
            });
        });`;

    const sinkOf = (world: MemoryWorld): ScriptComponentSink => {
        const sink = world.componentSink;
        if (sink === undefined) throw new Error('The scripts bound no component sink');
        return sink;
    };

    it('throws the errors BDS throws for a component registration it refuses', () => {
        const { scripts, log } = start(COMPONENTS);
        scripts.flush();
        expect(log.printed()).toEqual([
            "again: BlockCustomComponentAlreadyRegisteredError: Block custom component 'jsp:recorder' was already registered.",
            "bare: NamespaceNameError: There was an error with name 'recorder': string must be prefixed with a namespace (eg. namespace:value).",
            "minecraft: NamespaceNameError: There was an error with name 'minecraft:wand': string has invalid namespace (minecraft).",
            "item again: ItemCustomComponentAlreadyRegisteredError: Item custom component 'jsp:wand' was already registered.",
            "not a function: TypeError: Native type conversion failed. Interface property ['onPlace'] expected type: Closure: (BlockComponentOnPlaceEvent, CustomComponentParameters) => void | undefined (failed parsing interface to Function argument [1]).",
            'late: CustomComponentInvalidRegistryError: Cannot register custom component outside of the ModuleStartup event.'
        ]);
    });

    it('tells the world which hooks a registered component has', () => {
        const { world } = start(COMPONENTS);
        const sink = sinkOf(world);
        expect(sink.handlesBlock([{ name: 'jsp:recorder' }], 'onPlace')).toBe(true);
        expect(sink.handlesBlock([{ name: 'jsp:recorder' }], 'onPlayerInteract')).toBe(false);
        expect(sink.handlesBlock([{ name: 'jsp:nobody' }], 'onPlace')).toBe(false);
        // A block that names the component in minecraft:custom_components gets no onBreak, as on BDS.
        expect(sink.handlesBlock([{ name: 'jsp:recorder', legacy: true }], 'onBreak')).toBe(false);
        expect(sink.handlesItem([{ name: 'jsp:wand' }], 'onUse')).toBe(true);
    });

    it('runs a block hook in the next flush, with its event and the parameters the block gave', () => {
        const { scripts, world, log } = start(COMPONENTS);
        scripts.flush();
        const before = log.printed().length;
        world.setBlock('minecraft:overworld', { x: 0, y: -60, z: 0 }, { typeId: 'minecraft:stone', states: {} });
        sinkOf(world).block({
            hook: 'onPlace',
            block: AT,
            components: [{ name: 'jsp:recorder', params: { label: 'a' } }, { name: 'jsp:nobody' }],
            previousBlock: { typeId: 'minecraft:air', states: {} }
        });
        sinkOf(world).block({
            hook: 'onBreak',
            block: AT,
            components: [{ name: 'jsp:recorder', legacy: true }],
            brokenBlockPermutation: { typeId: 'minecraft:stone', states: {} }
        });
        expect(log.printed()).toHaveLength(before);
        scripts.flush();
        expect(log.printed().slice(before)).toEqual([
            'onPlace {"class":"BlockComponentOnPlaceEvent","params":{"label":"a"},"block":"minecraft:stone {\\"x\\":0,\\"y\\":-60,\\"z\\":0}","dimension":"minecraft:overworld","previousBlock":"minecraft:air"}'
        ]);
    });

    it('runs beforeOnPlayerPlace at once, in restricted execution, and hands back its cancel', () => {
        const { scripts, world, log } = start(COMPONENTS);
        scripts.flush();
        const place = (params: object): boolean =>
            sinkOf(world).block({
                hook: 'beforeOnPlayerPlace',
                block: AT,
                components: [{ name: 'jsp:recorder', params }],
                face: 'Up',
                permutationToPlace: { typeId: 'minecraft:oak_log', states: { pillar_axis: 'y' } }
            });
        expect(place({ refuse: true })).toBe(true);
        expect(place({})).toBe(false);
        expect(log.printed()).toContain(
            'ReferenceError: Native function [Dimension::setWeather] cannot be used in restricted execution.'
        );
        expect(log.printed()).toContain(
            'beforeOnPlayerPlace {"class":"BlockComponentPlayerPlaceBeforeEvent","params":{"refuse":true},"block":"minecraft:air {\\"x\\":0,\\"y\\":-60,\\"z\\":0}","dimension":"minecraft:overworld","placing":"minecraft:oak_log"}'
        );
    });

    it('runs an item hook in the next flush with the stack and its user', () => {
        const { scripts, world, log } = start(COMPONENTS);
        scripts.flush();
        const player = world.join('Steve');
        sinkOf(world).item({
            hook: 'onUse',
            components: [{ name: 'jsp:wand', params: { power: 3 } }],
            item: { typeId: 'minecraft:apple', amount: 1 },
            source: { id: player, typeId: 'minecraft:player' }
        });
        scripts.flush();
        expect(log.printed()).toContain(
            'onUse {"class":"ItemComponentUseEvent","params":{"power":3},"item":"minecraft:apple","source":"minecraft:player"}'
        );
    });

    it('binds no sink for a pack that registers no component, and takes it off the world on shutdown', () => {
        const { world } = start(`import { system } from '@minecraft/server';`);
        expect(world.componentSink).toBeUndefined();
        const { scripts, world: other } = start(COMPONENTS);
        expect(other.componentSink).toBeDefined();
        scripts.shutdown();
        expect(other.componentSink).toBeUndefined();
    });
});
