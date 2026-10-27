import { beforeAll, describe, expect, it } from 'vitest';

import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { singleDimension } from '../../content/world/adapter';
import { entityContentGroups } from '../contentAdapter';
import { EntityRuntime } from './EntityRuntime';
import { dataEntityRecordOf } from './persistence';
import { TestEntityWorld } from './testing';

describe.skipIf(!process.env.JSP_CONTENT_VANILLA)('the runtime over every vanilla entity definition', () => {
    let runtime: EntityRuntime;
    let identifiers: readonly string[];

    beforeAll(() => {
        const world = new TestEntityWorld();
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
});
