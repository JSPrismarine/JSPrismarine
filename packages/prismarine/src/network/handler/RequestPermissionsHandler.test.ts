import { PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { HandlerServices } from './HandlerContext';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed, STEVE } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import type { ShownPlayer } from '../../world/ShownPlayer';
import RequestPermissionsPacket from '@jsprismarine/protocol/packet/RequestPermissionsPacket';
import RequestPermissionsHandler from './RequestPermissionsHandler';

/**
 * The permission dropdown in the client's player list sends this packet. The op list is the
 * server's only permission level, so Operator and not-Operator are the two outcomes, and
 * anything else gets the current abilities back.
 */
const fakeSession = ({ op = true }: { op?: boolean } = {}) => {
    const opChanges: Array<[string, boolean]> = [];
    const resent: Array<ShownPlayer | undefined> = [];
    const logged: string[] = [];
    const target = stub<ShownPlayer>({});
    const targetSession = stub<PlayerSession>({
        runtimeId: 7n,
        identity: identityNamed('Alex'),
        shown: () => target
    });

    return {
        opChanges,
        resent,
        logged,
        target,
        log: stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') }),
        services: {
            sessions: stub<HandlerServices['sessions']>({
                sessionOf: (id) => (id === targetSession.runtimeId ? targetSession : null)
            }),
            permissions: stub<HandlerServices['permissions']>({
                isOp: (uuid) => op && uuid === STEVE.uuid,
                setOpNow: (session, value) => {
                    opChanges.push([session.identity.name, value]);
                    return Promise.resolve();
                }
            })
        },
        session: stub<PlayerSession>({
            identity: STEVE,
            sendAbilities: async (player) => void resent.push(player)
        })
    };
};

/** Runs one request as the input step would, and returns what the handler handed the step. */
const handle = async (fake: ReturnType<typeof fakeSession>, packet: RequestPermissionsPacket) => {
    const { context, outputs, deferred, settled } = inputContext(fake.session, fake);
    const returned = new RequestPermissionsHandler().handle(packet, context);
    const handed = { returned, outputs: outputs.length, deferred: deferred.length };
    await settled();
    return handed;
};

const request = (level: PlayerPermissionLevel, target = 7n, customPermissionFlags = 0) =>
    Object.assign(new RequestPermissionsPacket(), {
        targetPlayerUniqueId: target,
        playerPermissionLevel: level,
        customPermissionFlags
    });

describe('RequestPermissionsHandler', () => {
    it('makes the target an operator when an operator asks', async () => {
        const fake = fakeSession();
        const { opChanges, resent } = fake;

        await handle(fake, request(PlayerPermissionLevel.OPERATOR));

        expect(opChanges).toEqual([['Alex', true]]);
        expect(resent).toEqual([]);
    });

    it('changes the op list before it returns and hands the sends to the step', () => {
        const fake = fakeSession();
        const { context, outputs, deferred } = inputContext(fake.session, fake);

        const returned = new RequestPermissionsHandler().handle(request(PlayerPermissionLevel.OPERATOR), context);

        expect(returned).toBeUndefined();
        expect(fake.opChanges).toEqual([['Alex', true]]);
        expect(outputs).toHaveLength(1);
        expect(deferred).toHaveLength(0);
    });

    it('sends nothing when a listener cancels the change', async () => {
        const fake = fakeSession();
        const permissions = stub<HandlerServices['permissions']>({ isOp: () => true, setOpNow: () => undefined });

        const handed = await handle(
            { ...fake, services: { ...fake.services, permissions } },
            request(PlayerPermissionLevel.OPERATOR)
        );

        expect(handed).toEqual({ returned: undefined, outputs: 0, deferred: 0 });
    });

    it('removes the target from the op list for Member and Visitor', async () => {
        const fake = fakeSession();
        const { opChanges } = fake;

        await handle(fake, request(PlayerPermissionLevel.MEMBER));
        await handle(fake, request(PlayerPermissionLevel.VISITOR));

        expect(opChanges).toEqual([
            ['Alex', false],
            ['Alex', false]
        ]);
    });

    it('refuses a non-operator by resending their own abilities', async () => {
        const fake = fakeSession({ op: false });
        const { opChanges, resent, logged } = fake;

        await handle(fake, request(PlayerPermissionLevel.OPERATOR));

        expect(opChanges).toEqual([]);
        expect(resent).toEqual([undefined]);
        expect(logged).toEqual(['Steve asked to set player 7 to permission level OPERATOR without being an operator']);
    });

    it('resends the target abilities for a Custom level it cannot model', async () => {
        const fake = fakeSession();
        const { opChanges, resent, logged, target } = fake;

        await handle(fake, request(PlayerPermissionLevel.CUSTOM, 7n, 0xff));

        expect(opChanges).toEqual([]);
        expect(resent).toEqual([target]);
        expect(logged).toEqual([
            'Steve asked to set Alex to permission level CUSTOM (custom flags 0xff). Only Member and Operator are modeled, so the current abilities were sent back'
        ]);
    });

    it('logs and does nothing for a target who is not online', async () => {
        const fake = fakeSession();
        const { opChanges, resent, logged } = fake;

        await handle(fake, request(PlayerPermissionLevel.OPERATOR, 99n));

        expect(opChanges).toEqual([]);
        expect(resent).toEqual([]);
        expect(logged).toEqual([
            'Steve asked to set player 99 to permission level OPERATOR, but no such player is online'
        ]);
    });
});
