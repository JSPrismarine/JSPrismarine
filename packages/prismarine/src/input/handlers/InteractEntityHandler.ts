import { Gametype } from '@jsprismarine/minecraft';

import { useItemOnEntity } from '../../item/interaction';
import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';
import { actorReachRefusal } from './entityReach';

/**
 * The player used the item in hand on an actor. The content's behaviors get the click: the
 * actor's interactions, and the item's `onUse`, which reads the clicked actor, as a spawn egg
 * does. A click on an actor the world does not track or out of the player's reach, or one a
 * behavior throws on, does nothing.
 */
export default class InteractEntityHandler implements IntentHandler<'interactEntity'> {
    public static readonly Kind = 'interactEntity';

    /** Offers the click to the content. */
    public handle(
        { target: runtimeId }: Intent<'interactEntity'>,
        { session, services, log }: InputContext
    ): undefined {
        if (session.getPlayer().gamemode === Gametype.SPECTATOR) return;
        const world = session.getWorld();
        const target = world.getActor(runtimeId);
        if (target === null) return;
        const position = target.getPosition();
        // The item's `onUse` acts on the actor, so one out of reach is not one the player clicked.
        const refusal = actorReachRefusal(session.getPlayer(), position);
        if (refusal !== null) {
            log.verbose(`Dropped a use on actor ${runtimeId} from ${session.identity.name}: it is ${refusal}`);
            return;
        }

        try {
            // The content rules take the session, which answers for the player and its client.
            useItemOnEntity({
                content: services.content,
                actors: services.contentWorld.actorsAt(world.getDimension().name, world.getLevel().name),
                player: session,
                target: {
                    identifier: target.getType(),
                    runtimeId: Number(target.getRuntimeId()),
                    position: { x: position.getX(), y: position.getY(), z: position.getZ() }
                }
            });
        } catch (error: unknown) {
            log.error(error);
        }
    }
}
