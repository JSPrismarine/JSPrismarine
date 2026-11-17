import { describe, expect, it } from 'vitest';

import { SCRIPT_MODULE_HISTORIES } from '../../src/generated/scriptModules.ts';
import type { ModuleShape } from '../../src/shape/history.ts';
import { shapeAt } from '../../src/shape/history.ts';
import { shapeVersionFor } from './pack.mts';
import type { ModuleUses, ScriptFile } from './usage.mts';
import { UsageCollector } from './usage.mts';

/** Counts files against the newest stable shape of each generated module. */
const count = (...files: (string | ScriptFile)[]): Map<string, ModuleUses> => {
    const shapes = new Map<string, ModuleShape>();
    const collector = new UsageCollector({
        isNative: (module) => module in SCRIPT_MODULE_HISTORIES || module === '@minecraft/server-gametest',
        shape: (module) => {
            const history = SCRIPT_MODULE_HISTORIES[module];
            if (history === undefined) return undefined;
            const version = shapeVersionFor(history, undefined);
            if (version === undefined) return undefined;
            const shape = shapes.get(module) ?? shapeAt(history, version);
            shapes.set(module, shape);
            return shape;
        }
    });
    const errors = collector.addFiles(
        files.map((file, index) => (typeof file === 'string' ? { name: `file${index}.ts`, code: file } : file))
    );
    expect(Object.fromEntries(errors)).toEqual({});
    return collector.modules;
};

/** The keys counted for a module, sorted. */
const keys = (modules: Map<string, ModuleUses>, module = '@minecraft/server', kind: keyof ModuleUses = 'uses') =>
    [...(modules.get(module)?.[kind].keys() ?? [])].sort();

describe('the corpus usage counter', () => {
    it('follows an event subscription to the members its callback reads', () => {
        const modules = count(`
            import { world } from '@minecraft/server';
            world.afterEvents.entityDie.subscribe((event) => {
                event.deadEntity.kill();
            });
        `);
        expect(keys(modules)).toEqual([
            'Entity.kill',
            'EntityDieAfterEvent.deadEntity',
            'EntityDieAfterEventSignal.subscribe',
            'World.afterEvents',
            'WorldAfterEvents.entityDie',
            'world'
        ]);
    });

    it('resolves a call through a computed key the source spells out, as it does a dot call', () => {
        const dot = count(`
            import { world } from '@minecraft/server';
            world.getPlayers()[0].kill();
        `);
        const computed = count(`
            import { world } from '@minecraft/server';
            world['getPlayers']()[0]['kill']();
            world[\`getAllPlayers\`]().forEach((player) => player.sendMessage('a'));
        `);
        expect(keys(dot)).toEqual(['Entity.kill', 'World.getPlayers', 'world']);
        expect(keys(computed)).toEqual([
            'Entity.kill',
            'Player.sendMessage',
            'World.getAllPlayers',
            'World.getPlayers',
            'world'
        ]);
    });

    it('counts every occurrence', () => {
        const modules = count(`
            import { world } from '@minecraft/server';
            world.sendMessage('a');
            world.sendMessage('b');
        `);
        expect(modules.get('@minecraft/server')?.uses.get('World.sendMessage')).toBe(2);
    });

    it('reads a namespace import and a destructured event', () => {
        const modules = count(`
            import * as mc from '@minecraft/server';
            mc.world.afterEvents.playerSpawn.subscribe(({ player }) => player.sendMessage('hi'));
        `);
        expect(keys(modules)).toContain('PlayerSpawnAfterEvent.player');
        expect(keys(modules)).toContain('Player.sendMessage');
    });

    it('types a parameter from its annotation and counts an inherited member on its declaring class', () => {
        const modules = count(`
            import type { Player } from '@minecraft/server';
            export const heal = (player: Player) => player.addEffect('regeneration', 20);
        `);
        expect(keys(modules)).toEqual(['Entity.addEffect']);
    });

    it('follows arrays, for...of and await', () => {
        const modules = count(`
            import { world } from '@minecraft/server';
            import { ActionFormData } from '@minecraft/server-ui';
            for (const player of world.getAllPlayers()) player.sendMessage('a');
            world.getPlayers().forEach((player) => player.kill());
            export async function ask(player) {
                const response = await new ActionFormData().title('t').show(player);
                return response.selection;
            }
        `);
        expect(keys(modules)).toEqual(expect.arrayContaining(['Player.sendMessage', 'Entity.kill']));
        expect(keys(modules, '@minecraft/server-ui')).toEqual([
            'ActionFormData',
            'ActionFormData.constructor',
            'ActionFormData.show',
            'ActionFormData.title',
            'ActionFormResponse.selection'
        ]);
    });

    it('gives both parameters of a sort comparator the element type', () => {
        const modules = count(`
            import { world } from '@minecraft/server';
            world.getPlayers().sort((a, b) => a.level - b.level);
            world.getPlayers().toSorted((a, b) => a.name.localeCompare(b.name));
            world.getPlayers().forEach((player, index) => player.level + index.level);
        `);
        const uses = modules.get('@minecraft/server')?.uses;
        expect(uses?.get('Player.level')).toBe(3);
        expect(uses?.get('Player.name')).toBe(2);
    });

    it('follows a name through straight-line reassignment', () => {
        const modules = count(`
            import { world } from '@minecraft/server';
            let target = world.getDimension('overworld');
            target.getBlock({ x: 0, y: 0, z: 0 });
            target = world.getPlayers()[0];
            target.kill();
            target = JSON.parse('{}');
            target.kill();
            target.getBlock({ x: 0, y: 0, z: 0 });
            let later;
            later = world.getPlayers()[0];
            later.kill();
        `);
        const uses = modules.get('@minecraft/server')?.uses;
        expect(uses?.get('Dimension.getBlock')).toBe(1);
        expect(uses?.get('Entity.kill')).toBe(2);
        expect(modules.get('@minecraft/server')?.unmatched.size).toBe(0);
    });

    it('gives getComponent the class of a literal component id', () => {
        const modules = count(`
            import { EntityComponentTypes, world } from '@minecraft/server';
            const [player] = world.getAllPlayers();
            player.getComponent('inventory').container.getItem(0);
            player.getComponent(EntityComponentTypes.Health).currentValue;
        `);
        expect(keys(modules)).toEqual(
            expect.arrayContaining([
                'EntityInventoryComponent.container',
                'Container.getItem',
                'EntityComponentTypes.Health',
                'EntityAttributeComponent.currentValue'
            ])
        );
    });

    it('checks an options object against its interface, and calls its callbacks with typed arguments', () => {
        const modules = count(`
            import { system, world } from '@minecraft/server';
            world.getDimension('overworld').getEntities({ type: 'minecraft:cow', location: { x: 0, y: 0, z: 0 } });
            system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
                blockComponentRegistry.registerCustomComponent('a:b', {
                    onPlayerInteract(event) {
                        event.block.setType('minecraft:air');
                    }
                });
            });
        `);
        // `type` is a field of EntityFilter, which EntityQueryOptions extends.
        expect(keys(modules, '@minecraft/server', 'fields')).toEqual([
            'BlockCustomComponent.onPlayerInteract',
            'EntityFilter.type',
            'EntityQueryOptions.location',
            'Vector3.x',
            'Vector3.y',
            'Vector3.z'
        ]);
        expect(keys(modules)).toEqual(expect.arrayContaining(['BlockEvent.block', 'Block.setType']));
    });

    it('leaves out a shadowed import, a type-only reference and an npm library', () => {
        const modules = count(`
            import { world, type Player } from '@minecraft/server';
            import { Vector3Utils } from '@minecraft/math';
            function local(world) {
                world.sendMessage('not the API');
            }
            let player: Player;
            Vector3Utils.add({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
        `);
        expect(keys(modules)).toEqual([]);
        expect(modules.has('@minecraft/math')).toBe(false);
    });

    it('records a member the shape lacks, unless a file of the pack declares it', () => {
        const modules = count(
            `
            declare module '@minecraft/server' {
                interface Player {
                    database: unknown;
                }
            }
            `,
            `
            import { world } from '@minecraft/server';
            world.afterEvents.playerSpawn.subscribe(({ player }) => {
                player.database;
                player.notAMember();
            });
            `
        );
        expect(keys(modules, '@minecraft/server', 'unmatched')).toEqual(['Player.notAMember']);
    });

    it('counts the names a module without a generated shape exports', () => {
        const modules = count(`
            import { register } from '@minecraft/server-gametest';
            register('a', 'b', () => {});
        `);
        expect(keys(modules, '@minecraft/server-gametest')).toEqual(['register']);
    });

    it('reads JavaScript as well', () => {
        const modules = count({
            name: 'main.js',
            code: `import { system } from '@minecraft/server'; system.runInterval(() => {}, 20);`
        });
        expect(keys(modules)).toEqual(['System.runInterval', 'system']);
    });
});
