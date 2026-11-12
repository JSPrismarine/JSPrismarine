import type { Logger } from '@jsprismarine/logger';
import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type ClientConnection from '../ClientConnection';
import { latestCodec } from '../codec/CodecRegistry';
import type PlayerSession from '../PlayerSession';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/packet/SetDefaultGameTypePacket';
import type { HandlerServices } from './HandlerContext';
import type { World } from '../../world/World';
import { WorldMessages } from '../../world/WorldMessages';
import SetDefaultGameTypeHandler from './SetDefaultGameTypeHandler';

/**
 * A server holding Survival as its default, with the requesting player in the Overworld and one
 * other in the Nether. Everything a packet handler may send is captured per player.
 */
const fakeServer = ({ op, saveFails = false }: { op: boolean; saveFails?: boolean }) => {
    const logged: string[] = [];
    const applied: Array<[string, Gametype | undefined]> = [];
    const committed: Array<[number, boolean | undefined]> = [];
    const sent = new Map<string, NetworkPacket[]>();
    let configured = 'Survival';

    const ops = new Set<string>();
    /** A world whose input step applies a message as it is, recording that it ran there. */
    const worldNamed = (name: string) =>
        stub<World>({
            getName: () => name,
            runInputNow: (apply) => {
                inputs.push(name);
                apply();
            }
        });
    /** The worlds a message was applied in, in order. */
    const inputs: string[] = [];
    const overworld = worldNamed('overworld');
    const nether = worldNamed('nether');
    const messages = new WorldMessages((error) => void logged.push(String(error)));
    const fakePlayer = (name: string, uuid: string, isOp: boolean, world: World) => {
        const packets: NetworkPacket[] = [];
        sent.set(name, packets);
        const session = stub<PlayerSession>({
            identity: identityNamed(name, uuid),
            getConnection: () =>
                stub<ClientConnection>({ sendDataPacket: async (packet) => void packets.push(packet) }),
            getWorld: () => world,
            setGamemode: async (mode?: Gametype) => void applied.push([name, mode]),
            released: (sends) => void sends.catch((error: unknown) => void logged.push(String(error)))
        });
        if (isOp) ops.add(uuid);
        return { player: session, session };
    };

    const requester = fakePlayer('Steve', '00000000-0000-0000-0000-000000000001', op, overworld);
    const other = fakePlayer('Alex', '00000000-0000-0000-0000-000000000002', false, nether);

    const parts = {
        log: stub<Logger>({
            warn: (...message) => void logged.push(String(message[0])),
            debug: (...message) => void logged.push(String(message[0])),
            error: (message) => void logged.push(String(message))
        }),
        config: { getGamemode: () => configured },
        services: {
            defaults: stub<HandlerServices['defaults']>({
                setGamemode: async (gamemode, commit) => {
                    committed.push([gamemode, commit]);
                    configured = Gametype[gamemode] ?? configured;
                    if (saveFails) throw new Error('disk full');
                }
            }),
            sessions: stub<HandlerServices['sessions']>({ getSessions: () => [requester.session, other.session] }),
            permissions: stub<HandlerServices['permissions']>({ isOp: (uuid) => ops.has(uuid) }),
            messages
        }
    };

    /** Runs one request as the input step would, and returns what the handler handed the step. */
    const handle = async (packet: SetDefaultGameTypePacket) => {
        const { context, outputs, settled } = inputContext(requester.session, parts);
        const returned = new SetDefaultGameTypeHandler().handle(packet, context);
        const handed = { returned, outputs: outputs.length, applied: applied.length };
        await settled();
        return handed;
    };

    return { logged, applied, committed, sent, handle, messages, inputs };
};

const request = (gamemode: Gametype): SetDefaultGameTypePacket =>
    Object.assign(new SetDefaultGameTypePacket(), { gamemode });

const defaults = (packets: NetworkPacket[] | undefined): Gametype[] =>
    (packets ?? []).map((packet) => {
        expect(packet).toBeInstanceOf(SetDefaultGameTypePacket);
        return packet instanceof SetDefaultGameTypePacket ? packet.gamemode : Gametype.UNDEFINED;
    });

describe('SetDefaultGameTypeHandler', () => {
    it('applies an operator request to the config and every player, then tells every client', async () => {
        const { applied, committed, sent, handle, messages } = fakeServer({ op: true });

        await handle(request(Gametype.CREATIVE));
        messages.admit();

        expect(committed).toEqual([[Gametype.CREATIVE, true]]);
        expect(applied).toEqual([
            ['Steve', Gametype.CREATIVE],
            ['Alex', Gametype.CREATIVE]
        ]);
        expect(defaults(sent.get('Steve'))).toEqual([Gametype.CREATIVE]);
        expect(defaults(sent.get('Alex'))).toEqual([Gametype.CREATIVE]);
    });

    it("moves the sender's world in the handler and sends every other world a message for its input step", async () => {
        const { applied, committed, sent, handle, messages, inputs } = fakeServer({ op: true });

        const handed = await handle(request(Gametype.CREATIVE));

        // Steve's world changes in the handler's unit, with the sends handed
        // to the step, and Alex in the Nether is untouched until a message is applied there.
        expect(handed).toEqual({ returned: undefined, outputs: 1, applied: 1 });
        expect(committed).toEqual([[Gametype.CREATIVE, true]]);
        expect(applied).toEqual([['Steve', Gametype.CREATIVE]]);
        expect(sent.get('Alex')).toEqual([]);
        expect(messages.size).toBe(1);

        expect(messages.admit()).toBe(1);
        expect(inputs).toEqual(['nether']);
        expect(applied).toEqual([
            ['Steve', Gametype.CREATIVE],
            ['Alex', Gametype.CREATIVE]
        ]);
        expect(defaults(sent.get('Alex'))).toEqual([Gametype.CREATIVE]);
    });

    it('logs a default it could not save and still moves the players onto it', async () => {
        const { applied, logged, handle, messages } = fakeServer({ op: true, saveFails: true });

        await handle(request(Gametype.CREATIVE));
        messages.admit();

        expect(logged).toEqual([`Could not save the default game type ${Gametype.CREATIVE}: Error: disk full`]);
        expect(applied).toHaveLength(2);
    });

    it('hands the reply to a refused request to the step', async () => {
        const { handle } = fakeServer({ op: false });

        expect(await handle(request(Gametype.CREATIVE))).toEqual({
            returned: undefined,
            outputs: 1,
            applied: 0
        });
    });

    it('refuses a player who is not an operator and sends the current default back', async () => {
        const { applied, committed, logged, sent, handle } = fakeServer({ op: false });

        await handle(request(Gametype.CREATIVE));

        expect(committed).toEqual([]);
        expect(applied).toEqual([]);
        expect(logged).toEqual(['Player Steve tried to change default gamemode without proper permissions.']);
        expect(defaults(sent.get('Steve'))).toEqual([Gametype.SURVIVAL]);
        expect(sent.get('Alex')).toEqual([]);
    });

    it('refuses a value the config cannot hold without throwing', async () => {
        const { applied, committed, logged, sent, handle } = fakeServer({ op: true });

        // 42 is not a `Gametype`, so it has to come in off the wire: ZigZag of 42 is 0x54.
        const packet = new SetDefaultGameTypePacket(Buffer.from([latestCodec.ids.SetDefaultGameTypePacket!, 0x54]));
        packet.decode();

        await handle(packet);

        expect(committed).toEqual([]);
        expect(applied).toEqual([]);
        expect(logged).toEqual(['Steve asked for default game type 42, which a server cannot hold']);
        expect(defaults(sent.get('Steve'))).toEqual([Gametype.SURVIVAL]);
    });

    it('refuses the docs values a config has no name for', async () => {
        const { committed, handle } = fakeServer({ op: true });

        await handle(request(Gametype.DEFAULT));
        await handle(request(Gametype.UNDEFINED));

        expect(committed).toEqual([]);
    });
});
