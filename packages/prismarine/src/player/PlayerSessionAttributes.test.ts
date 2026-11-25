import { describe, expect, it } from 'vitest';

import { Attribute, AttributeIds, Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import type { ShownActor } from '../world/ShownActor';
import { stub } from '../testing/stub.test.helper';
import type UpdateAttributesPacket from '@jsprismarine/protocol/bedrock/packet/UpdateAttributesPacket';
import PlayerSession from './PlayerSession';
import type { SessionPresenter, ShownVitals } from './presenter/SessionPresenter';
import type { SessionPlayer } from './sessionPlayers';
import { sessionPlayerFields } from '../testing/playerSession.test.helper';

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
    const player = stub<ShownActor>({ getRuntimeId: () => 1n });
    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection: {
            sendDataPacket: async (packet: UpdateAttributesPacket) => void sent.push(packet)
        },
        ...sessionPlayerFields(player, 1n),
        presenter: stub<SessionPresenter>({ edition: 'bedrock' }),
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
            const zombie = stub<ShownActor>({ getRuntimeId: () => 9n });

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

        it('shows a client of another edition its own vitals when one changes, and nothing else', async () => {
            const shown: ShownVitals[] = [];
            const attributes = new Attributes(Attributes.getPlayerDefaults());
            attributes.setValue(AttributeIds.Health, 7);
            const player = stub<ShownActor & SessionPlayer>({ getRuntimeId: () => 1n, attributes });
            const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
                connection: { sendDataPacket: async () => {} },
                ...sessionPlayerFields(player, 1n),
                presenter: stub<SessionPresenter>({
                    edition: 'java',
                    showVitals: async (vitals) => void shown.push(vitals)
                }),
                lastInputTick: 0n
            });

            await session.sendAttributesFor(player, [health()]);
            await session.sendAttributesFor(stub<ShownActor>({ getRuntimeId: () => 2n }), [health()]);
            await session.sendAttributesFor(
                player,
                attributes.getAttributes().filter((a) => a.getName() === AttributeIds.Movement)
            );

            expect(shown).toEqual([{ health: 7, food: 20, saturation: 5 }]);
        });
    });
});
