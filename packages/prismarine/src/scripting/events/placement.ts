/**
 * `world.beforeEvents.playerPlaceBlock` and `world.afterEvents.playerPlaceBlock`, from the
 * server's `playerPlaceBlock` and `playerBlockPlaced` events.
 */
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import { blockValue, DIRECTIONS, permutationValue, playerValue, vectorValue } from './values';
import type { WorldEventSource } from './worldEvents';

/** The placements of one level's players. */
export const placementEvents = (server: Server, level: Level): WorldEventSource => {
    const { events } = server.getKernel();
    return {
        guard: (guard) =>
            events.on('playerPlaceBlock', (event) => {
                const world = event.getWorld();
                if (world.getLevel() !== level || event.isCanceled()) return;
                const block = event.getBlock();
                const { x, y, z } = event.getFaceLocation();
                const verdict = guard({
                    event: 'PlayerPlaceBlockBeforeEvent',
                    fields: {
                        player: playerValue(event.getPlayer()),
                        block: blockValue(world, block),
                        face: DIRECTIONS[event.getFace()],
                        faceLocation: vectorValue(x, y, z),
                        permutationToPlace: permutationValue(block)
                    }
                });
                if (verdict.veto) event.preventDefault();
            }),
        events: (listener) =>
            events.on('playerBlockPlaced', (event) => {
                const world = event.getWorld();
                if (world.getLevel() !== level) return;
                const block = event.getBlock();
                listener({
                    event: 'PlayerPlaceBlockAfterEvent',
                    fields: {
                        player: playerValue(event.getPlayer()),
                        block: blockValue(world, block),
                        permutation: permutationValue(block)
                    }
                });
            })
    };
};
