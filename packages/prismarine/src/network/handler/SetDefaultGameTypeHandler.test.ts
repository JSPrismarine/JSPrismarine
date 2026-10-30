import type { Logger } from '@jsprismarine/logger';
import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type SessionManager from '../../SessionManager';
import type { Config } from '../../config/Config';
import { stub } from '../../testing/stub.test.helper';
import type ClientConnection from '../ClientConnection';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/packet/SetDefaultGameTypePacket';
import SetDefaultGameTypeHandler from './SetDefaultGameTypeHandler';

/**
 * A server holding Survival as its default, with the requesting player and one other online.
 * Everything a packet handler may send is captured per player.
 */
const fakeServer = ({ op }: { op: boolean }) => {
    const logged: string[] = [];
    const applied: Array<[string, Gametype | undefined]> = [];
    const committed: Array<[number, boolean | undefined]> = [];
    const sent = new Map<string, NetworkPacket[]>();
    let configured = 'Survival';

    const fakePlayer = (name: string, isOp: boolean) => {
        const packets: NetworkPacket[] = [];
        sent.set(name, packets);
        const session = stub<PlayerSession>({
            getConnection: () => stub<ClientConnection>({ sendDataPacket: async (packet) => void packets.push(packet) })
        });
        const player = stub<Player>({
            getName: () => name,
            isOp: () => isOp,
            setGamemode: async (mode) => void applied.push([name, mode]),
            getNetworkSession: () => session
        });
        Object.assign(session, { getPlayer: () => player });
        return { player, session };
    };

    const requester = fakePlayer('Steve', op);
    const other = fakePlayer('Alex', false);

    const server = stub<Server>({
        getLogger: () =>
            stub<Logger>({
                warn: (...message) => void logged.push(String(message[0])),
                debug: (...message) => void logged.push(String(message[0]))
            }),
        getConfig: () =>
            stub<Config>({
                getGamemode: () => configured,
                setGamemode: (gamemode, commit) => {
                    committed.push([gamemode, commit]);
                    configured = Gametype[gamemode] ?? configured;
                }
            }),
        getSessionManager: () => stub<SessionManager>({ getAllPlayers: () => [requester.player, other.player] })
    });

    return { logged, applied, committed, sent, server, session: requester.session };
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
        const { applied, committed, sent, server, session } = fakeServer({ op: true });

        await new SetDefaultGameTypeHandler().handle(request(Gametype.CREATIVE), server, session);

        expect(committed).toEqual([[Gametype.CREATIVE, true]]);
        expect(applied).toEqual([
            ['Steve', Gametype.CREATIVE],
            ['Alex', Gametype.CREATIVE]
        ]);
        expect(defaults(sent.get('Steve'))).toEqual([Gametype.CREATIVE]);
        expect(defaults(sent.get('Alex'))).toEqual([Gametype.CREATIVE]);
    });

    it('refuses a player who is not an operator and sends the current default back', async () => {
        const { applied, committed, logged, sent, server, session } = fakeServer({ op: false });

        await new SetDefaultGameTypeHandler().handle(request(Gametype.CREATIVE), server, session);

        expect(committed).toEqual([]);
        expect(applied).toEqual([]);
        expect(logged).toEqual(['Player Steve tried to change default gamemode without proper permissions.']);
        expect(defaults(sent.get('Steve'))).toEqual([Gametype.SURVIVAL]);
        expect(sent.get('Alex')).toEqual([]);
    });

    it('refuses a value the config cannot hold without throwing', async () => {
        const { applied, committed, logged, sent, server, session } = fakeServer({ op: true });

        // 42 is not a `Gametype`, so it has to come in off the wire: ZigZag of 42 is 0x54.
        const packet = new SetDefaultGameTypePacket(Buffer.from([Identifiers.SetDefaultGameTypePacket, 0x54]));
        packet.decode();

        await new SetDefaultGameTypeHandler().handle(packet, server, session);

        expect(committed).toEqual([]);
        expect(applied).toEqual([]);
        expect(logged).toEqual(['Steve asked for default game type 42, which a server cannot hold']);
        expect(defaults(sent.get('Steve'))).toEqual([Gametype.SURVIVAL]);
    });

    it('refuses the docs values a config has no name for', async () => {
        const { committed, server, session } = fakeServer({ op: true });

        await new SetDefaultGameTypeHandler().handle(request(Gametype.DEFAULT), server, session);
        await new SetDefaultGameTypeHandler().handle(request(Gametype.UNDEFINED), server, session);

        expect(committed).toEqual([]);
    });
});
