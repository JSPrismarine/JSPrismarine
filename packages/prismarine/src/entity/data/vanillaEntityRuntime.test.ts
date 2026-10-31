import { beforeAll, describe, expect, it } from 'vitest';

import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { singleDimension } from '../../content/world/adapter';
import { entityContentGroups } from '../contentAdapter';
import { EntityRuntime } from './EntityRuntime';
import { dataEntityRecordOf } from './persistence';
import { TestEntityWorld } from './testing';

describe.skipIf(!process.env.JSP_CONTENT_VANILLA)(
    'the runtime over every vanilla entity definition',
    { tags: ['real-data'] },
    () => {
        let runtime: EntityRuntime;
        let identifiers: readonly string[];
        let world: TestEntityWorld;

        beforeAll(() => {
            world = new TestEntityWorld();
            let content: ServerContent | undefined;
            runtime = new EntityRuntime({
                content: () => {
                    if (content === undefined) throw new Error('the runtime read content before the build finished');
                    return content;
                },
                world: world.world,
                host: world.host,
                report: () => undefined
            });
            const adapter = { ...world.world, ticks: world.ticks, ...entityContentGroups(runtime) };
            content = buildServerContent({ world: singleDimension(adapter) });
            identifiers = content.entities.registry.keys().filter((identifier) => identifier !== 'minecraft:player');
        });

        it('runs the sulfur cube bouncy archetype through its active component-group physics', () => {
            const cube = runtime.spawn('minecraft:sulfur_cube', { x: 0.5, y: 64.5, z: 0.5 });
            if (cube === undefined) throw new Error('the vanilla pack declares no minecraft:sulfur_cube');
            cube.body.push({ x: 1, y: -1, z: 0 });
            cube.instance.fire('minecraft:become_bouncy');

            runtime.tick(1);

            expect(cube.instance.componentParams('minecraft:bounciness')).toBe(0.9);
            expect(cube.instance.componentParams('minecraft:air_drag_modifier')).toBe(0.01);
            expect(cube.position.y).toBe(64);
            expect(cube.body.velocity.x).toBeCloseTo(0.999);
            expect(cube.body.velocity.y).toBeCloseTo(0.9);
            runtime.remove(cube.id, 'vanilla physics coverage');
        });

        it('reads sulfur cube ground friction from its active archetype group', () => {
            const cube = runtime.spawn('minecraft:sulfur_cube', { x: 10.5, y: 64, z: 0.5 });
            if (cube === undefined) throw new Error('the vanilla pack declares no minecraft:sulfur_cube');
            cube.body.push({ x: 1, y: 0, z: 0 });
            cube.instance.fire('minecraft:become_bouncy');

            runtime.tick(2);

            expect(cube.instance.componentParams('minecraft:friction_modifier')).toBe(0.3);
            expect(cube.body.velocity.x).toBeCloseTo(0.8638);
            runtime.remove(cube.id, 'vanilla physics coverage');
        });

        it('explodes a hit end crystal through the pack’s crystal_exploding group', () => {
            const crystal = runtime.spawn('minecraft:ender_crystal', { x: 200.5, y: 64, z: 200.5 });
            if (crystal === undefined) throw new Error('the vanilla pack declares no minecraft:ender_crystal');
            expect(crystal.instance.attributes.get('health')?.max).toBe(1);

            runtime.hurt(crystal, undefined, 'entity_attack', 1);
            runtime.tick(1);

            expect(crystal.removed).toBe('explosion');
            expect(crystal.instance.componentParams('minecraft:explode')).toMatchObject({
                power: 6,
                causes_fire: false,
                fuse_length: 0
            });
        });

        it('spawns the dragon with the pack’s 200 health and lands only the hits Java counts', () => {
            const dragon = runtime.spawn('minecraft:ender_dragon', { x: 240.5, y: 64, z: 240.5 });
            if (dragon === undefined) throw new Error('the vanilla pack declares no minecraft:ender_dragon');
            expect(dragon.instance.attributes.get('health')?.max).toBe(200);

            world.players = [{ id: 7777, identifier: 'minecraft:player', position: { x: 240.5, y: 64, z: 242.5 } }];
            runtime.hurt(dragon, undefined, 'entity_attack', 10);
            expect(dragon.instance.attributes.get('health')?.current).toBe(200);

            runtime.hurt(dragon, 7777, 'entity_attack', 10);
            expect(dragon.instance.attributes.get('health')?.current).toBe(200 - (10 / 4 + 1));

            world.players = [];
            runtime.remove(dragon.id, 'vanilla dragon coverage');
        });

        it('spawns and restores every declared entity through its components', () => {
            for (const [index, identifier] of identifiers.entries()) {
                const position = {
                    x: 0.5 + (index % 12) * 3,
                    y: 64,
                    z: 0.5 + Math.floor(index / 12) * 3
                };
                const spawnData = identifier === 'minecraft:falling_block' ? { block: 'minecraft:stone' } : undefined;
                const entity = runtime.spawn(identifier, position, spawnData === undefined ? {} : { data: spawnData });
                if (entity === undefined) throw new Error(`${identifier} did not produce a runtime entity`);

                const record = dataEntityRecordOf(entity, undefined);
                expect(record.identifier).toBe(identifier);
                runtime.remove(entity.id, 'vanilla runtime coverage');
                expect(runtime.byId(entity.id)).toBeUndefined();

                const restored = runtime.restore(record, position);
                if (restored === undefined) throw new Error(`${identifier} did not restore into the runtime`);
                expect(restored.identifier).toBe(identifier);
            }

            expect(runtime.all().map((entity) => entity.identifier)).toEqual(identifiers);
        });
    }
);
