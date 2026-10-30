import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import * as Handlers from '../Handlers';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import NpcRequestPacket, { NpcRequestType } from '@jsprismarine/protocol/packet/NpcRequestPacket';
import NpcRequestHandler from './NpcRequestHandler';

describe('NpcRequestHandler', () => {
    const run = (requestType: number): string[] => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new NpcRequestPacket(), { npcRuntimeId: 7n, requestType });

        new NpcRequestHandler().handle(packet, server, session);
        return logged;
    };

    it('names the request type it knows', () => {
        expect(run(NpcRequestType.ExecuteAction)).toEqual([
            'Steve sent ExecuteAction to NPC 7, which the server has no NPCs to apply'
        ]);
    });

    it('falls back to the raw number for a request type it does not know', () => {
        expect(run(99)).toEqual(['Steve sent 99 to NPC 7, which the server has no NPCs to apply']);
    });

    it('is registered for packet 0x62', () => {
        expect(Handlers.NpcRequestHandler).toBe(NpcRequestHandler);
        expect(NpcRequestHandler.PacketName).toBe('NpcRequestPacket');
    });
});
