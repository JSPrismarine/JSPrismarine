import { describe, expect, it } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';
import type { PermissionManager } from '../../permission/PermissionManager';
import { canExecute } from '../../permission/PermissionManager';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import SetPlayerGameTypePacket from '@jsprismarine/protocol/packet/SetPlayerGameTypePacket';
import { PacketIdentifier } from '@jsprismarine/protocol';
import SetPlayerGameTypeHandler from './SetPlayerGameTypeHandler';

/**
 * The permission check used to be inverted: a player with `minecraft.command.gamemode` was
 * ignored and anyone else got the game type they asked for.
 */
const fakeSession = (permissions: string[]) => {
    const applied: Gametype[] = [];
    const resent: Array<Gametype | undefined> = [];
    const session = stub<PlayerSession>({
        isOp: () => false,
        getPermissions: () => permissions,
        setGamemode: async (mode?: Gametype) => void applied.push(mode ?? Gametype.SURVIVAL),
        sendGamemode: async (gamemode) => void resent.push(gamemode)
    });
    const { context, outputs, deferred, settled } = inputContext(session, {
        services: { permissions: stub<PermissionManager>({ can: canExecute }) }
    });
    return { applied, resent, context, outputs, deferred, settled };
};

const request = (gametype: Gametype): SetPlayerGameTypePacket => new SetPlayerGameTypePacket({ gametype });

describe('SetPlayerGameTypeHandler', () => {
    it('applies the requested game type for a player who may run the gamemode command', async () => {
        const { applied, resent, context, deferred, outputs, settled } = fakeSession(['minecraft.command.gamemode']);

        new SetPlayerGameTypeHandler().handle(request(Gametype.CREATIVE), context);
        // In the input's own unit: the change is written before the handler returns, and only
        // the sends are left to wait on.
        expect(deferred).toHaveLength(0);
        expect(outputs).toHaveLength(1);
        expect(applied).toEqual([Gametype.CREATIVE]);
        await settled();

        expect(applied).toEqual([Gametype.CREATIVE]);
        expect(resent).toEqual([]);
    });

    it('resends the current game type to a player who may not', async () => {
        const { applied, resent, context, settled } = fakeSession([]);

        new SetPlayerGameTypeHandler().handle(request(Gametype.CREATIVE), context);
        await settled();

        expect(applied).toEqual([]);
        expect(resent).toEqual([undefined]);
    });

    it('resends the current game type when the value is not a game type', async () => {
        const { applied, resent, context, settled } = fakeSession(['minecraft.command.gamemode']);

        // 42 is not a `Gametype`, so it has to come in off the wire: ZigZag of 42 is 0x54.
        const packet = new SetPlayerGameTypePacket(Buffer.from([PacketIdentifier.SET_PLAYER_GAME_TYPE, 0x54]));
        packet.decode();

        new SetPlayerGameTypeHandler().handle(packet, context);
        await settled();

        expect(applied).toEqual([]);
        expect(resent).toEqual([undefined]);
    });
});
