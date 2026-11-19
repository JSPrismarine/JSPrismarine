import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test-utils';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import { readScriptConfig, readScriptPack } from './pack';
import { WorldScripts } from './WorldScripts';

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Writes a pack declaring the shipped beta of `@minecraft/server` whose entry is `source`. */
const writePack = (source: string) => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-events-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name: 'events', uuid: '0d5b8a8e-1c55-4f0e-a3f3-5ad2c7e4a101', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: '0d5b8a8e-1c55-4f0e-a3f3-5ad2c7e4a102', entry: 'scripts/main.js' }],
            dependencies: [{ module_name: '@minecraft/server', version: '2.12.0-beta' }]
        })
    );
    writeFileSync(join(directory, 'scripts', 'main.js'), source);
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error('the pack has a script module');
    return pack;
};

const PRELUDE = `
import { world } from '@minecraft/server';
const show = (value) => value === undefined ? 'undefined' : JSON.stringify(value);
`;

const PIG = { id: '7', typeId: 'minecraft:pig' };
const BLOCK = { dimension: 'minecraft:overworld', x: 1, y: -60, z: 2 };
const STONE = { typeId: 'minecraft:stone', states: {} };

describe.skipIf(!scriptHostAvailable())("WorldScripts's world events", () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const running: WorldScripts[] = [];
    afterEach(() => {
        for (const scripts of running.splice(0)) scripts.shutdown();
    });

    /** Loads `source` at the pack's top level with the Beta APIs experiment on, and runs one flush. */
    const start = (source: string, world = new MemoryWorld()) => {
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
                error: (line: string) => lines.push(`error ${line.replace(/^\[Scripting\] \[events\] /, '')}`)
            },
            seed: 1n,
            betaApis: true
        });
        running.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        scripts.flush();
        return { world, lines, scripts };
    };

    it('sends an after-event in the flush, with its members read from the fields the world gave it', () => {
        const { world, lines, scripts } = start(`
            let kept;
            world.afterEvents.playerPlaceBlock.subscribe((event) => {
                kept = event;
                console.warn('placed ' + event.player.typeId + ' ' + event.block.typeId + ' ' + show(event.block.location) + ' ' + event.dimension.id);
            });
            world.afterEvents.entityHitEntity.subscribe((event) =>
                console.warn('hit ' + event.damagingEntity.id + ' ' + event.hitEntity.typeId));
            world.afterEvents.playerDimensionChange.subscribe((event) =>
                console.warn('travel ' + event.fromDimension.id + ' ' + show(event.fromLocation) + ' ' + event.toDimension.id));
            world.afterEvents.entityRemove.subscribe((event) => {
                console.warn('removed ' + event.removedEntityId + ' ' + event.typeId);
                try { kept.player; } catch (error) { console.warn('kept ' + error); }
            });
        `);
        const player = world.join('Steve');
        world.setBlock('minecraft:overworld', BLOCK, STONE);
        world.raise({
            event: 'PlayerPlaceBlockAfterEvent',
            fields: { player: { entity: { id: player, typeId: 'minecraft:player' } }, block: { block: BLOCK } }
        });
        world.raise({
            event: 'EntityHitEntityAfterEvent',
            fields: {
                damagingEntity: { entity: { id: player, typeId: 'minecraft:player' } },
                hitEntity: { entity: PIG }
            }
        });
        world.raise({
            event: 'PlayerDimensionChangeAfterEvent',
            fields: {
                player: { entity: { id: player, typeId: 'minecraft:player' } },
                fromDimension: { dimension: 'minecraft:overworld' },
                fromLocation: { vector: { x: 1, y: 2, z: 3 } },
                toDimension: { dimension: 'minecraft:nether' },
                toLocation: { vector: { x: 0, y: 64, z: 0 } }
            }
        });
        world.raise({
            event: 'EntityRemoveAfterEvent',
            fields: { removedEntityId: '7', typeId: 'minecraft:pig', removedEntity: { entity: PIG } }
        });
        scripts.flush();
        expect(lines).toEqual([
            'placed minecraft:player minecraft:stone {"x":1,"y":-60,"z":2} minecraft:overworld',
            `hit ${player} minecraft:pig`,
            'travel minecraft:overworld {"x":1,"y":2,"z":3} minecraft:nether',
            'removed 7 minecraft:pig',
            'kept ReferenceError: The event is no longer valid'
        ]);
    });

    it('runs a before-event at once in restricted execution, and hands back what its scripts changed', () => {
        const { world, lines } = start(`
            world.beforeEvents.effectAdd.subscribe((event) => {
                console.warn('effect ' + event.effectType + ' ' + event.duration + ' ' + event.entity.typeId);
                event.duration = 40.9;
            });
            world.beforeEvents.playerGameModeChange.subscribe((event) => {
                console.warn('mode ' + event.fromGameMode + ' ' + event.toGameMode);
                if (event.toGameMode === 'Spectator') event.cancel = true;
                else event.toGameMode = 'Adventure';
            });
            world.beforeEvents.explosion.subscribe((event) => {
                console.warn('blocks ' + event.getImpactedBlocks().length);
                event.setImpactedBlocks(event.getImpactedBlocks().slice(1));
                try { world.getDimension('overworld').spawnEntity('minecraft:pig', { x: 0, y: 0, z: 0 }); } catch (error) { console.warn('restricted ' + error.name); }
            });
        `);
        const player = { entity: { id: world.join('Alex'), typeId: 'minecraft:player' } };
        expect(
            world.raise({
                event: 'EffectAddBeforeEvent',
                fields: { entity: { entity: PIG }, effectType: 'minecraft:speed', duration: 200 }
            })
        ).toEqual({
            veto: false,
            fields: { entity: { entity: PIG }, effectType: 'minecraft:speed', duration: 40 }
        });
        expect(
            world.raise({
                event: 'PlayerGameModeChangeBeforeEvent',
                fields: { player, fromGameMode: 'Survival', toGameMode: 'Spectator' }
            })
        ).toEqual({ veto: true });
        expect(
            world.raise({
                event: 'PlayerGameModeChangeBeforeEvent',
                fields: { player, fromGameMode: 'Survival', toGameMode: 'Creative' }
            })
        ).toEqual({ veto: false, fields: { player, fromGameMode: 'Survival', toGameMode: 'Adventure' } });
        const second = { ...BLOCK, x: 2 };
        expect(
            world.raise({
                event: 'ExplosionBeforeEvent',
                fields: { dimension: { dimension: 'minecraft:overworld' }, impactedBlocks: { blocks: [BLOCK, second] } }
            })
        ).toEqual({
            veto: false,
            fields: { dimension: { dimension: 'minecraft:overworld' }, impactedBlocks: { blocks: [second] } }
        });
        expect(lines).toEqual([
            'effect Speed 200 minecraft:pig',
            'mode Survival Spectator',
            'mode Survival Creative',
            'blocks 2',
            expect.stringMatching(/^restricted /)
        ]);
    });

    it('sends an event only to the subscribers whose options it passes', () => {
        const { world, lines, scripts } = start(`
            const placed = (label, options) =>
                world.afterEvents.playerPlaceBlock.subscribe(() => console.warn(label), options);
            placed('all');
            placed('stone', { blockTypes: ['stone'] });
            placed('dirt', { blockTypes: ['minecraft:dirt'] });
            world.afterEvents.playerHotbarSelectedSlotChange.subscribe(
                (event) => console.warn('slot ' + event.newSlotSelected), { allowedSlots: [3] });
            world.afterEvents.dataDrivenEntityTrigger.subscribe(
                (event) => console.warn('trigger ' + event.eventId + ' ' + show(event.getModifiers())),
                { entityTypes: ['minecraft:pig'], eventTypes: ['minecraft:become_adult'] });
            world.beforeEvents.entityHurt.subscribe(
                (event) => console.warn('hurt ' + event.damageSource.cause), { allowedDamageCauses: ['fall'] });
        `);
        const player = { entity: { id: world.join('Steve'), typeId: 'minecraft:player' } };
        world.raise({
            event: 'PlayerPlaceBlockAfterEvent',
            fields: { player, block: { block: BLOCK }, permutation: { permutation: STONE } }
        });
        for (const slot of [2, 3]) {
            world.raise({
                event: 'PlayerHotbarSelectedSlotChangeAfterEvent',
                fields: { player, newSlotSelected: slot, previousSlotSelected: 0 }
            });
        }
        for (const [entity, eventId] of [
            [PIG, 'minecraft:become_adult'],
            [PIG, 'minecraft:on_tame'],
            [{ id: '8', typeId: 'minecraft:cow' }, 'minecraft:become_adult']
        ] as const) {
            world.raise({
                event: 'DataDrivenEntityTriggerAfterEvent',
                fields: { entity: { entity }, eventId, addedComponentGroups: { json: '["adult"]' } }
            });
        }
        for (const cause of ['fall', 'lava']) {
            world.raise({
                event: 'EntityHurtBeforeEvent',
                fields: { hurtEntity: { entity: PIG }, damage: 2, damageSource: { damageSource: { cause } } }
            });
        }
        scripts.flush();
        expect(lines).toEqual([
            'hurt fall',
            'all',
            'stone',
            'slot 3',
            'trigger minecraft:become_adult [{"addedComponentGroups":["adult"],"removedComponentGroups":[],"triggers":[]}]'
        ]);
    });
});
