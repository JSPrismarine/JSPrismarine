/**
 * `world.beforeEvents.explosion`, `world.afterEvents.explosion` and `blockExplode`, from the
 * server's `explosion` and `exploded` events.
 */
import type { ScriptEventValue } from '@jsprismarine/script-host/host/world';

import type Server from '../../Server';
import type { Level } from '../../world/Level';
import type { World } from '../../world/World';
import { dimensionValue, entityValue, fieldsOf, permutationValue } from './values';
import type { WorldEventSource } from './worldEvents';

/** The blocks of a blast in one world, as `getImpactedBlocks` reads them. */
const blocksValue = (
    world: World,
    blocks: readonly { readonly x: number; readonly y: number; readonly z: number }[]
): ScriptEventValue => {
    const dimension = world.getDimension().bedrockName;
    return { blocks: blocks.map(({ x, y, z }) => ({ dimension, x, y, z })) };
};

/** The blasts of one level. */
export const explosionEvents = (server: Server, level: Level): WorldEventSource => {
    const { events } = server.getKernel();
    return {
        guard: (guard) =>
            events.on('explosion', (event) => {
                const world = event.getWorld();
                if (world.getLevel() !== level || event.isCanceled()) return;
                const source = event.getSource();
                const verdict = guard({
                    event: 'ExplosionBeforeEvent',
                    fields: fieldsOf({
                        dimension: dimensionValue(world),
                        source: source === null ? undefined : entityValue(source),
                        impactedBlocks: blocksValue(world, event.getBlocks())
                    })
                });
                if (verdict.veto) {
                    event.preventDefault();
                    return;
                }
                const impacted = verdict.fields.impactedBlocks;
                if (typeof impacted === 'object' && 'blocks' in impacted) {
                    const dimension = world.getDimension().bedrockName;
                    event.setBlocks(
                        impacted.blocks
                            .filter((block) => block.dimension === dimension)
                            .map(({ x, y, z }) => ({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) }))
                    );
                }
            }),
        events: (listener) =>
            events.on('exploded', (event) => {
                const world = event.getWorld();
                if (world.getLevel() !== level) return;
                const actor = event.getSource();
                const source = actor === null ? undefined : entityValue(actor);
                const blocks = event.getBlocks();
                for (const block of blocks) {
                    listener({
                        event: 'BlockExplodeAfterEvent',
                        fields: fieldsOf({
                            block: { block: { dimension: world.getDimension().bedrockName, ...xyz(block) } },
                            explodedBlockPermutation: permutationValue(block),
                            source
                        })
                    });
                }
                listener({
                    event: 'ExplosionAfterEvent',
                    fields: fieldsOf({
                        dimension: dimensionValue(world),
                        source,
                        impactedBlocks: blocksValue(world, blocks)
                    })
                });
            })
    };
};

const xyz = ({ x, y, z }: { readonly x: number; readonly y: number; readonly z: number }) => ({ x, y, z });
