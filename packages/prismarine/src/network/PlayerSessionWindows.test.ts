import { WindowIds, WindowTypes } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import type ClientConnection from './ClientConnection';
import type DataPacket from './packet/DataPacket';
import ContainerOpenPacket from './packet/ContainerOpenPacket';
import PlayerSession from './PlayerSession';

/**
 * The windows a session has opened on the client, and which `ContainerClose` it accepts for them.
 */

/** A session with the window state its constructor would give it, and a connection that records sends. */
const sessionFor = () => {
    const sent: DataPacket[] = [];
    const connection = stub<ClientConnection>({
        sendDataPacket: async (packet) => void sent.push(packet)
    });
    const player = stub<Player>({ getRuntimeId: () => 7n });

    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection,
        player,
        windowId: 0,
        openWindows: new Map<number, number>(),
        sendInventory: async () => {}
    });

    return { session, sent };
};

describe('network', () => {
    describe('PlayerSession windows', () => {
        it('opens the inventory under a fresh window id and remembers it until the close', async () => {
            const { session, sent } = sessionFor();

            await session.openMainInventory();

            const [open] = sent;
            expect(open).toBeInstanceOf(ContainerOpenPacket);
            expect(open).toMatchObject({
                windowId: WindowIds.FIRST,
                containerType: WindowTypes.INVENTORY,
                containerEntityId: 7n
            });

            expect(session.closeWindow(WindowIds.FIRST)).toBe(true);
            expect(session.closeWindow(WindowIds.FIRST)).toBe(false);
        });

        it('refuses to close a window it never opened', () => {
            const { session } = sessionFor();

            expect(session.closeWindow(WindowIds.INVENTORY)).toBe(false);
            expect(session.closeWindow(42)).toBe(false);
        });
    });
});
