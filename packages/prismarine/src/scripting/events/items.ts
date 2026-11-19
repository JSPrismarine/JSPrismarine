/**
 * `world.afterEvents.entityItemDrop`, and `world.beforeEvents` and `afterEvents.entityItemPickup`,
 * from the server's `entityItemDrop`, `entityItemPickup` and `entityItemPickedUp` events.
 */
import type { ScriptItem } from '@jsprismarine/script-host/host/world';

import type { Item } from '../../item/Item';
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import { scriptItemOf } from '../levelScriptAccess';
import { fieldsOf, itemValue, playerValue } from './values';
import type { WorldEventSource } from './worldEvents';

/** The type the scripts give a dropped stack. */
const ITEM_ENTITY = 'minecraft:item';

const stacksOf = (items: readonly Item[]): ScriptItem[] =>
    items.flatMap((item) => {
        const read = scriptItemOf(item);
        return read === null ? [] : [read];
    });

/** The dropped stacks of one level's players. */
export const itemEvents = (server: Server, level: Level): WorldEventSource => {
    const { events } = server.getKernel();
    return {
        guard: (guard) =>
            events.on('entityItemPickup', (event) => {
                if (event.getWorld().getLevel() !== level || event.isCanceled()) return;
                const verdict = guard({
                    event: 'EntityItemPickupBeforeEvent',
                    fields: fieldsOf({
                        entity: playerValue(event.getTaker()),
                        item: { entity: { id: String(event.getItemEntity()), typeId: ITEM_ENTITY } },
                        itemStack: itemValue(event.getItem())
                    })
                });
                if (verdict.veto) event.preventDefault();
            }),
        events: (listener) => {
            const stops = [
                events.on('entityItemDrop', (event) => {
                    if (event.getWorld().getLevel() !== level) return;
                    listener({
                        event: 'EntityItemDropAfterEvent',
                        fields: {
                            entity: playerValue(event.getDropper()),
                            items: {
                                entities: event.getEntities().map((id) => ({ id: String(id), typeId: ITEM_ENTITY }))
                            },
                            itemStacks: { items: stacksOf(event.getItems()) }
                        }
                    });
                }),
                events.on('entityItemPickedUp', (event) => {
                    if (event.getWorld().getLevel() !== level) return;
                    listener({
                        event: 'EntityItemPickupAfterEvent',
                        fields: {
                            entity: playerValue(event.getTaker()),
                            items: { items: stacksOf([event.getItem()]) }
                        }
                    });
                })
            ];
            return () => {
                for (const stop of stops) stop();
            };
        }
    };
};
