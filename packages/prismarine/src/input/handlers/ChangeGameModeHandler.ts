import type { Gametype } from '@jsprismarine/minecraft';

import { isGametype } from '../../isGametype';
import type { InputContext } from '../../network/handler/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** The sender as this handler sees it: what the permission check reads, and the change. */
interface GamemodePlayer {
    isOp(): boolean;
    getPermissions(): string[];
    setGamemode(mode: Gametype): Promise<void>;
}

/**
 * Applies the game mode a player picked for itself.
 *
 * Only a player who may run `minecraft.command.gamemode` gets the change. Anyone else, and any
 * value that is not a `Gametype`, gets the current game mode sent back so the client's dropdown
 * returns to what the server holds.
 */
export default class ChangeGameModeHandler implements IntentHandler<'changeGameMode'> {
    public static readonly Kind = 'changeGameMode';

    /** Applies the requested game mode, or resends the current one when the request is refused. */
    public handle({ gamemode }: Intent<'changeGameMode'>, { session, services, step }: InputContext): undefined {
        const player: GamemodePlayer = session;
        const allowed = services.permissions.can(player).execute('minecraft.command.gamemode');
        if (!allowed || !isGametype(gamemode)) {
            step.output(session.sendGamemode());
            return;
        }

        // In this input's unit: `setGamemode` writes the game mode and queues its packets before
        // it returns, and what it hands back only waits for the transport.
        step.output(player.setGamemode(gamemode));
    }
}
