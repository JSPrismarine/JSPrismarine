/**
 * `world.afterEvents.blockContainerOpened`, `blockContainerClosed`, `entityContainerOpened` and
 * `entityContainerClosed`, from the server's `playerContainer` event.
 */
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import { blockValue, permutationValue, playerValue } from './values';
import type { WorldEventSource } from './worldEvents';

/** The containers one level's players open and close. */
export const containerEvents = (server: Server, level: Level): WorldEventSource => ({
    events: (listener) =>
        server.getKernel().events.on('playerContainer', (event) => {
            const world = event.getWorld();
            if (world.getLevel() !== level) return;
            const source = playerValue(event.getSession().runtimeId);
            const owner = event.getOwner();
            const opened = event.isOpened();
            if ('block' in owner) {
                listener({
                    event: opened ? 'BlockContainerOpenedAfterEvent' : 'BlockContainerClosedAfterEvent',
                    fields: {
                        block: blockValue(world, owner.block),
                        permutation: permutationValue(owner.block),
                        source
                    }
                });
                return;
            }
            listener({
                event: opened ? 'EntityContainerOpenedAfterEvent' : 'EntityContainerClosedAfterEvent',
                fields: {
                    entity: { entity: { id: String(owner.entity.runtimeId), typeId: owner.entity.type } },
                    source
                }
            });
        })
});
