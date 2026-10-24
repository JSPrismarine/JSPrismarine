import { describe, expect, it } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';
import type Player from '../../Player';
import type Server from '../../Server';
import type { PermissionManager } from '../../permission/PermissionManager';
import { canExecute } from '../../permission/PermissionManager';
import { stub } from '../../testing/stub.test.helper';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import SetPlayerGametypePacket from '../packet/SetPlayerGametypePacket';
import SetPlayerGametypeHandler from './SetPlayerGametypeHandler';

/**
 * The permission check used to be inverted: a player with `minecraft.command.gamemode` was
 * ignored and anyone else got the game type they asked for.
 */
const fakeSession = (permissions: string[]) => {
    const applied: Gametype[] = [];
    const resent: Array<Gametype | undefined> = [];
    const player = stub<Player>({
        isOp: () => false,
        getPermissions: () => permissions,
        setGamemode: async (mode) => void applied.push(mode ?? Gametype.SURVIVAL)
    });

    return {
        applied,
        resent,
        server: stub<Server>({ getPermissionManager: () => stub<PermissionManager>({ can: canExecute }) }),
        session: stub<PlayerSession>({
            getPlayer: () => player,
            sendGamemode: async (gamemode) => void resent.push(gamemode)
        })
    };
};

const request = (gametype: Gametype): SetPlayerGametypePacket =>
    Object.assign(new SetPlayerGametypePacket(), { gametype });

describe('SetPlayerGametypeHandler', () => {
    it('applies the requested game type for a player who may run the gamemode command', async () => {
        const { applied, resent, server, session } = fakeSession(['minecraft.command.gamemode']);

        await new SetPlayerGametypeHandler().handle(request(Gametype.CREATIVE), server, session);

        expect(applied).toEqual([Gametype.CREATIVE]);
        expect(resent).toEqual([]);
    });

    it('resends the current game type to a player who may not', async () => {
        const { applied, resent, server, session } = fakeSession([]);

        await new SetPlayerGametypeHandler().handle(request(Gametype.CREATIVE), server, session);

        expect(applied).toEqual([]);
        expect(resent).toEqual([undefined]);
    });

    it('resends the current game type when the value is not a game type', async () => {
        const { applied, resent, server, session } = fakeSession(['minecraft.command.gamemode']);

        // 42 is not a `Gametype`, so it has to come in off the wire: ZigZag of 42 is 0x54.
        const packet = new SetPlayerGametypePacket(Buffer.from([Identifiers.SetPlayerGametypePacket, 0x54]));
        packet.decode();

        await new SetPlayerGametypeHandler().handle(packet, server, session);

        expect(applied).toEqual([]);
        expect(resent).toEqual([undefined]);
    });
});
