/**
 * `world.afterEvents.itemStartUse`, `itemCompleteUse`, `itemReleaseUse`, `itemStopUse`,
 * `itemStartUseOn` and `itemStopUseOn`, from the server's `playerItemUseStage` event.
 */
import type { ItemUseStage } from '../../events/player/PlayerItemUseStageEvent';
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import { blockValue, DIRECTIONS, fieldsOf, itemValue, playerValue } from './values';
import type { WorldEventSource } from './worldEvents';

/** The after-event of each stage. */
const EVENTS: Readonly<Record<ItemUseStage, string>> = {
    start: 'ItemStartUseAfterEvent',
    complete: 'ItemCompleteUseAfterEvent',
    release: 'ItemReleaseUseAfterEvent',
    stop: 'ItemStopUseAfterEvent',
    startOn: 'ItemStartUseOnAfterEvent',
    stopOn: 'ItemStopUseOnAfterEvent'
};

/** The item uses of one level's players. */
export const itemUseEvents = (server: Server, level: Level): WorldEventSource => ({
    events: (listener) =>
        server.getKernel().events.on('playerItemUseStage', (event) => {
            const world = event.getWorld();
            if (world.getLevel() !== level) return;
            const stage = event.getStage();
            const on = event.getBlock();
            const onBlock = on === undefined ? {} : { block: blockValue(world, on.at) };
            listener({
                event: EVENTS[stage],
                fields: fieldsOf({
                    source: playerValue(event.getPlayer()),
                    itemStack: itemValue(event.getItem()),
                    ...(stage === 'startOn' || stage === 'stopOn'
                        ? {
                              ...onBlock,
                              ...(stage === 'startOn' && on !== undefined ? { blockFace: DIRECTIONS[on.face] } : {})
                          }
                        : { useDuration: event.getUseDuration() })
                })
            });
        })
});
