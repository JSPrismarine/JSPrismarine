import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { PermissionManager } from '../../permission/PermissionManager';
import { canExecute } from '../../permission/PermissionManager';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../../network/PlayerSession';
import ChangeGameModeHandler from './ChangeGameModeHandler';

/**
 * The permission check used to be inverted: a player with `minecraft.command.gamemode` was
 * ignored and anyone else got the game type they asked for.
 */
const fakeSession = (permissions: string[]) => {
    const applied: Gametype[] = [];
    const resent: Array<Gametype | undefined> = [];
    const session = stub<PlayerSession>({
        isOp: () => false,
        hasPermission: (node) => permissions.includes(node),
        setGamemode: async (mode?: Gametype) => void applied.push(mode ?? Gametype.SURVIVAL),
        sendGamemode: async (gamemode) => void resent.push(gamemode)
    });
    const { context, outputs, settled } = inputContext(session, {
        services: { permissions: stub<PermissionManager>({ can: canExecute }) }
    });
    return { applied, resent, context, outputs, settled };
};

describe('ChangeGameModeHandler', () => {
    it('applies the requested game mode for a player who may run the gamemode command', async () => {
        const { applied, resent, context, outputs, settled } = fakeSession(['minecraft.command.gamemode']);

        new ChangeGameModeHandler().handle({ kind: 'changeGameMode', gamemode: Gametype.CREATIVE }, context);
        // In the input's own unit: the change is written before the handler returns, and only
        // the sends are left to wait on.
        expect(outputs).toHaveLength(1);
        expect(applied).toEqual([Gametype.CREATIVE]);
        await settled();

        expect(resent).toEqual([]);
    });

    it('resends the current game mode to a player who may not', async () => {
        const { applied, resent, context, settled } = fakeSession([]);

        new ChangeGameModeHandler().handle({ kind: 'changeGameMode', gamemode: Gametype.CREATIVE }, context);
        await settled();

        expect(applied).toEqual([]);
        expect(resent).toEqual([undefined]);
    });

    it('resends the current game mode when the value is not a game type', async () => {
        const { applied, resent, context, settled } = fakeSession(['minecraft.command.gamemode']);

        new ChangeGameModeHandler().handle({ kind: 'changeGameMode', gamemode: 42 }, context);
        await settled();

        expect(applied).toEqual([]);
        expect(resent).toEqual([undefined]);
    });
});
