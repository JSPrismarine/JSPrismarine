import { PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import type SessionManager from '../../SessionManager';
import type { PermissionManager } from '../../permission/PermissionManager';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import RequestPermissionsPacket from '@jsprismarine/protocol/packet/RequestPermissionsPacket';
import RequestPermissionsHandler from './RequestPermissionsHandler';

/**
 * The permission dropdown in the client's player list sends this packet. The op list is the
 * server's only permission level, so Operator and not-Operator are the two outcomes, and
 * anything else gets the current abilities back.
 */
const fakeSession = ({ op = true }: { op?: boolean } = {}) => {
    const opChanges: Array<[string, boolean]> = [];
    const resent: Array<Player | undefined> = [];
    const logged: string[] = [];
    const requester = stub<Player>({ getName: () => 'Steve', getRuntimeId: () => 1n, isOp: () => op });
    const target = stub<Player>({ getName: () => 'Alex', getRuntimeId: () => 7n });

    return {
        opChanges,
        resent,
        logged,
        target,
        server: stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') }),
            getSessionManager: () => stub<SessionManager>({ getAllPlayers: () => [requester, target] }),
            getPermissionManager: () =>
                stub<PermissionManager>({
                    setOp: async (name, value) => {
                        opChanges.push([name, value]);
                        return true;
                    }
                })
        }),
        session: stub<PlayerSession>({
            getPlayer: () => requester,
            sendAbilities: async (player) => void resent.push(player)
        })
    };
};

const request = (level: PlayerPermissionLevel, target = 7n, customPermissionFlags = 0) =>
    Object.assign(new RequestPermissionsPacket(), {
        targetPlayerUniqueId: target,
        playerPermissionLevel: level,
        customPermissionFlags
    });

describe('RequestPermissionsHandler', () => {
    it('makes the target an operator when an operator asks', async () => {
        const { opChanges, resent, server, session } = fakeSession();

        await new RequestPermissionsHandler().handle(request(PlayerPermissionLevel.OPERATOR), server, session);

        expect(opChanges).toEqual([['Alex', true]]);
        expect(resent).toEqual([]);
    });

    it('removes the target from the op list for Member and Visitor', async () => {
        const { opChanges, server, session } = fakeSession();

        await new RequestPermissionsHandler().handle(request(PlayerPermissionLevel.MEMBER), server, session);
        await new RequestPermissionsHandler().handle(request(PlayerPermissionLevel.VISITOR), server, session);

        expect(opChanges).toEqual([
            ['Alex', false],
            ['Alex', false]
        ]);
    });

    it('refuses a non-operator by resending their own abilities', async () => {
        const { opChanges, resent, logged, server, session } = fakeSession({ op: false });

        await new RequestPermissionsHandler().handle(request(PlayerPermissionLevel.OPERATOR), server, session);

        expect(opChanges).toEqual([]);
        expect(resent).toEqual([undefined]);
        expect(logged).toEqual(['Steve asked to set player 7 to permission level OPERATOR without being an operator']);
    });

    it('resends the target abilities for a Custom level it cannot model', async () => {
        const { opChanges, resent, logged, target, server, session } = fakeSession();

        await new RequestPermissionsHandler().handle(request(PlayerPermissionLevel.CUSTOM, 7n, 0xff), server, session);

        expect(opChanges).toEqual([]);
        expect(resent).toEqual([target]);
        expect(logged).toEqual([
            'Steve asked to set Alex to permission level CUSTOM (custom flags 0xff). Only Member and Operator are modeled, so the current abilities were sent back'
        ]);
    });

    it('logs and does nothing for a target who is not online', async () => {
        const { opChanges, resent, logged, server, session } = fakeSession();

        await new RequestPermissionsHandler().handle(request(PlayerPermissionLevel.OPERATOR, 99n), server, session);

        expect(opChanges).toEqual([]);
        expect(resent).toEqual([]);
        expect(logged).toEqual([
            'Steve asked to set player 99 to permission level OPERATOR, but no such player is online'
        ]);
    });
});
