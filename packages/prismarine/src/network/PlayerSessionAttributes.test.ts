import { describe, expect, it } from 'vitest';

import { Attribute, AttributeIds } from '../entity/Attribute';
import type { Entity } from '../entity/Entity';
import { stub } from '../testing/stub.test.helper';
import type UpdateAttributesPacket from './packet/UpdateAttributesPacket';
import PlayerSession from './PlayerSession';

/**
 * The `Tick` of an `UpdateAttributesPacket` is a `PlayerInputTick`. The docs want the tick of
 * the last `PlayerAuthInputPacket` the server handled when the attributes are the receiving
 * player's, and zero for any other entity. The server's own tick counter is neither, and the
 * client cannot match it against its input history.
 */

const health = () => new Attribute({ name: AttributeIds.Health, min: 0, max: 20, def: 20, value: 7 });

/** A session with the connection replaced, so the packets that go out can be inspected. */
const attributeSession = () => {
    const sent: UpdateAttributesPacket[] = [];
    const player = stub<Entity>({ getRuntimeId: () => 1n });
    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection: {
            sendDataPacket: async (packet: UpdateAttributesPacket) => void sent.push(packet)
        },
        player,
        lastInputTick: 0n
    });

    return { session, sent, player };
};

describe('network', () => {
    describe('PlayerSession attributes', () => {
        it('sends a zero tick before the client has sent any input', async () => {
            const { session, sent, player } = attributeSession();

            await session.sendAttributesFor(player, [health()]);

            expect(sent).toHaveLength(1);
            expect(sent[0]?.tick).toBe(0n);
            expect(sent[0]?.runtimeEntityId).toBe(1n);
        });

        it("carries the client's last input tick for the player's own attributes", async () => {
            const { session, sent, player } = attributeSession();

            session.recordInputTick(41n);
            session.recordInputTick(42n);
            await session.sendAttributesFor(player, [health()]);

            expect(sent[0]?.tick).toBe(42n);
        });

        it('does not wind the tick back for an input that arrives out of order', async () => {
            const { session, sent, player } = attributeSession();

            session.recordInputTick(42n);
            session.recordInputTick(40n);
            await session.sendAttributesFor(player, [health()]);

            expect(sent[0]?.tick).toBe(42n);
        });

        it("sends a zero tick for another entity's attributes", async () => {
            const { session, sent } = attributeSession();
            const zombie = stub<Entity>({ getRuntimeId: () => 9n });

            session.recordInputTick(42n);
            await session.sendAttributesFor(zombie, [health()]);

            expect(sent[0]?.runtimeEntityId).toBe(9n);
            expect(sent[0]?.tick).toBe(0n);
        });

        it('sends nothing for an empty list', async () => {
            const { session, sent, player } = attributeSession();

            await session.sendAttributesFor(player, []);

            expect(sent).toHaveLength(0);
        });
    });
});
