import type { Gametype, GametypeName } from '@jsprismarine/minecraft';
import { getGametypeId, getGametypeName } from '@jsprismarine/minecraft';

import type PlayerSession from '../PlayerSession';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/packet/SetDefaultGameTypePacket';
import type { HandlerConfig, HandlerServices, InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * The name the config stores for a default, or null when it has none for the value.
 *
 * `getGametypeName` is what `Config.setGamemode` goes through, so it decides what a default
 * can be: Survival, Creative, Adventure or Spectator. It throws for the rest, which a client
 * is free to send (`Default`, `WorldDefault`, or any number at all).
 */
const nameOfDefault = (gamemode: Gametype): GametypeName | null => {
    try {
        return getGametypeName(gamemode);
    } catch {
        return null;
    }
};

/**
 * Moves one player onto the default the config holds now, and tells their client its mode and
 * then the default. Both queue their packets as they are called, so the mode goes out first.
 */
const applyDefault = (config: Pick<HandlerConfig, 'getGamemode'>, target: PlayerSession): Promise<void> =>
    Promise.all([target.setGamemode(getGametypeId(config.getGamemode())), sendDefault(config, target)]).then(
        () => undefined
    );

/**
 * Files {@link applyDefault} for the input step of the world a player stands in.
 *
 * The default is read when the message is applied rather than when it is filed, so of two
 * requests from two worlds in one step the later one is what every player ends up on, whichever
 * world's message is applied first. A player who changed world before it is applied gets it in
 * the world they are in now.
 */
const fileDefault = (
    messages: HandlerServices['messages'],
    config: Pick<HandlerConfig, 'getGamemode'>,
    target: PlayerSession
): void => {
    const world = target.getWorld();
    messages.send(world, () => {
        if (target.getWorld() !== world) fileDefault(messages, config, target);
        else target.released(applyDefault(config, target));
    });
};

/** Tells one client the default the server holds. */
const sendDefault = async (config: Pick<HandlerConfig, 'getGamemode'>, session: PlayerSession): Promise<void> => {
    const reply = new SetDefaultGameTypePacket();
    reply.gamemode = getGametypeId(config.getGamemode());
    await session.getConnection().sendDataPacket(reply);
};

/**
 * Applies the default game type a client picked from the world settings screen.
 *
 * Only an operator gets the change, and only for a value the config can hold. A refused
 * request is answered with the default the server has, because the client has already moved
 * its screen to the value it asked for. An accepted one is written to the config, applied to
 * every player, and then sent to every client, which is what the docs describe.
 */
export default class SetDefaultGameTypeHandler implements InputLaneHandler<SetDefaultGameTypePacket> {
    public static PacketName = 'SetDefaultGameTypePacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /**
     * Sets the configured default and moves every player onto it, when the sender may.
     *
     * The default changes in memory at once, and the config file is written off the tick.
     */
    public handle(packet: SetDefaultGameTypePacket, { session, log, config, services, step }: InputContext): undefined {
        if (!services.permissions.isOp(session.identity.uuid)) {
            log.warn(`Player ${session.identity.name} tried to change default gamemode without proper permissions.`);
            step.output(sendDefault(config, session));
            return;
        }

        if (nameOfDefault(packet.gamemode) === null) {
            log.debug(
                `${session.identity.name} asked for default game type ${packet.gamemode}, which a server cannot hold`,
                'SetDefaultGameTypeHandler/handle'
            );
            step.output(sendDefault(config, session));
            return;
        }

        services.defaults.setGamemode(packet.gamemode, true).catch((error: unknown) => {
            log.error(`Could not save the default game type ${packet.gamemode}: ${error}`);
        });
        // Each player's game mode is written in the world the player stands in: at once for the
        // sender's world, whose input step this is, and as a message for any other world, which
        // its own input step applies. Each client hears its new mode and then the default.
        const world = session.getWorld();
        for (const target of services.sessions.getSessions()) {
            if (target.getWorld() === world) step.output(applyDefault(config, target));
            else fileDefault(services.messages, config, target);
        }
    }
}
