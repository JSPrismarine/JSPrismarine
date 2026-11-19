/**
 * `world.afterEvents.playerStartBreakingBlock`, `entityHitBlock`, `playerCancelBreakingBlock` and
 * `playerSwingStart`, from the server's `playerBlockAction` and `playerSwing` events.
 */
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import { blockValue, DIRECTIONS, fieldsOf, itemValue, permutationValue, playerValue } from './values';
import type { WorldEventSource } from './worldEvents';

/** Each swing source a client names, as `EntitySwingSource` names it. */
const SWING_SOURCES: Readonly<Record<string, string>> = {
    attack: 'Attack',
    build: 'Build',
    dropitem: 'DropItem',
    event: 'Event',
    interact: 'Interact',
    mine: 'Mine',
    none: 'None',
    throwitem: 'ThrowItem',
    useitem: 'UseItem'
};

/** The mining and swings of one level's players. */
export const miningEvents = (server: Server, level: Level): WorldEventSource => {
    const { events } = server.getKernel();
    return {
        events: (listener) => {
            const stops = [
                events.on('playerBlockAction', (event) => {
                    const world = event.getWorld();
                    if (world.getLevel() !== level) return;
                    const block = event.getBlock();
                    const face = DIRECTIONS[event.getFace()];
                    const player = playerValue(event.getPlayer());
                    const common = {
                        player,
                        block: blockValue(world, block),
                        blockPermutation: permutationValue(block),
                        face,
                        heldItemStack: itemValue(event.getItem())
                    };
                    if (event.getAction() === 'abort') {
                        listener({
                            event: 'PlayerCancelBreakingBlockAfterEvent',
                            fields: fieldsOf({ ...common, breakProgress: event.getProgress() })
                        });
                        return;
                    }
                    listener({
                        event: 'EntityHitBlockAfterEvent',
                        fields: {
                            damagingEntity: player,
                            hitBlock: blockValue(world, block),
                            hitBlockPermutation: permutationValue(block),
                            blockFace: face
                        }
                    });
                    listener({ event: 'PlayerStartBreakingBlockAfterEvent', fields: fieldsOf(common) });
                }),
                events.on('playerSwing', (event) => {
                    const session = event.getSession();
                    if (session.getWorld().getLevel() !== level) return;
                    listener({
                        event: 'PlayerSwingStartAfterEvent',
                        fields: fieldsOf({
                            player: playerValue(session.runtimeId),
                            heldItemStack: itemValue(event.getItem()),
                            swingSource: SWING_SOURCES[(event.getSource() ?? 'none').toLowerCase()] ?? 'None'
                        })
                    });
                })
            ];
            return () => {
                for (const stop of stops) stop();
            };
        }
    };
};
