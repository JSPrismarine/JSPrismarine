import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import PacketViolationWarningPacket, {
    PacketViolationSeverity,
    PacketViolationType
} from '../packet/PacketViolationWarningPacket';
import PacketViolationWarningHandler from './PacketViolationWarningHandler';

describe('PacketViolationWarningHandler', () => {
    const handleWith = (fields: Partial<PacketViolationWarningPacket>): string[] => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ warn: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new PacketViolationWarningPacket(), fields);

        new PacketViolationWarningHandler().handle(packet, server, session);
        return logged;
    };

    it('warns with the rejected packet named from its id', () => {
        expect(
            handleWith({
                type: PacketViolationType.PacketMalformed,
                severity: PacketViolationSeverity.TerminatingConnection,
                packetId: Identifiers.StartGamePacket,
                message: 'Unexpected end of stream'
            })
        ).toEqual([
            'Steve rejected StartGamePacket (0xb) as PacketMalformed, TerminatingConnection: "Unexpected end of stream"'
        ]);
    });

    it('falls back to numbers for an id and members it does not know', () => {
        expect(handleWith({ type: 7, severity: 9, packetId: 0x7ff, message: '' })).toEqual([
            'Steve rejected an unregistered packet (0x7ff) as type 7, severity 9: ""'
        ]);
    });

    it('names the Unknown members rather than mistaking -1 for a missing name', () => {
        expect(
            handleWith({
                type: PacketViolationType.Unknown,
                severity: PacketViolationSeverity.Unknown,
                packetId: Identifiers.TextPacket,
                message: 'x'
            })
        ).toEqual(['Steve rejected TextPacket (0x9) as Unknown, Unknown: "x"']);
    });
});
