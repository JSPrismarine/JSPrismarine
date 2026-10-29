import { Gametype } from '@jsprismarine/minecraft';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import { CREATIVE_REACH, SURVIVAL_REACH } from '../../entity/Combat';
import type InteractPacket from '../packet/InteractPacket';
import { InteractAction } from '../packet/InteractPacket';
import type PacketHandler from './PacketHandler';

/**
 * The slack added to a player's reach when checking the actor they say they interacted with.
 *
 * Reach is measured from the player's feet to the actor's feet, and a tall actor is clicked
 * well above where it stands. One block covers that. The check bounds nonsense rather than
 * policing reach.
 */
const REACH_SLACK = 1;

/**
 * What a client did to an actor, or that it pressed the inventory button.
 *
 * Only `OpenInventory` does anything yet. The target it names has to be the sender's own
 * runtime id, which is what a client sends and what PocketMine checks; a packet naming anyone
 * else is dropped. `NpcOpen` is checked the way an attack is, by whether the client has been
 * shown the actor and whether it is within reach, and then recorded as unimplemented.
 * `InteractUpdate` arrives every time the crosshair crosses an actor, and
 * `StopRiding` has no vehicles to leave, so both are ignored. Nothing here
 * throws: a value no client sends is logged and dropped.
 */
export default class InteractHandler implements PacketHandler<InteractPacket> {
    public static PacketName = 'InteractPacket';

    public async handle(packet: InteractPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();

        switch (packet.action) {
            case InteractAction.StopRiding:
            case InteractAction.InteractUpdate:
                return;

            case InteractAction.OpenInventory: {
                if (packet.target !== player.getRuntimeId()) {
                    server
                        .getLogger()
                        .debug(
                            `Dropped an inventory open from ${player.getName()}: it names actor ${packet.target}, not themselves`,
                            'InteractHandler/handle'
                        );
                    return;
                }

                await session.openMainInventory();
                return;
            }

            case InteractAction.NpcOpen: {
                const target = player.getWorld().getEntity(packet.target);
                if (target === null || !session.tracks(packet.target)) {
                    server
                        .getLogger()
                        .debug(
                            `Dropped an NPC open from ${player.getName()}: actor ${packet.target} is not one they have been shown`,
                            'InteractHandler/handle'
                        );
                    return;
                }

                const reach = (player.gamemode === Gametype.CREATIVE ? CREATIVE_REACH : SURVIVAL_REACH) + REACH_SLACK;
                const distance = player.getPosition().distanceTo(target.getPosition());
                // Written so a NaN distance fails too.
                if (!(distance <= reach)) {
                    server
                        .getLogger()
                        .debug(
                            `Dropped an NPC open from ${player.getName()}: actor ${packet.target} is ${distance.toFixed(1)} away`,
                            'InteractHandler/handle'
                        );
                    return;
                }

                server
                    .getLogger()
                    .debug(
                        `${player.getName()} opened NPC ${packet.target}. NPC dialogue is not implemented`,
                        'InteractHandler/handle'
                    );
                return;
            }

            default:
                server
                    .getLogger()
                    .verbose(
                        `Dropped interact action ${packet.action} from ${player.getName()}: not one a client sends`,
                        'InteractHandler/handle'
                    );
        }
    }
}
