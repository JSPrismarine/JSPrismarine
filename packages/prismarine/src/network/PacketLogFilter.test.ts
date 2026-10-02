import { describe, expect, it } from 'vitest';

import { PacketLogFilter } from './PacketLogFilter';

class SetTimePacket {}
class UpdateBlockPacket {}

describe('network', () => {
    describe('PacketLogFilter', () => {
        it('drops the packets it was given, by class name', () => {
            const filter = new PacketLogFilter(['SetTimePacket']);

            expect(filter.shouldLog(new SetTimePacket())).toBe(false);
        });

        it('keeps everything else', () => {
            const filter = new PacketLogFilter(['SetTimePacket']);

            expect(filter.shouldLog(new UpdateBlockPacket())).toBe(true);
        });

        it('logs everything when nothing is excluded', () => {
            // The default a session falls back to when no filter is handed down.
            const filter = new PacketLogFilter();

            expect(filter.shouldLog(new SetTimePacket())).toBe(true);
            expect(filter.shouldLog(new UpdateBlockPacket())).toBe(true);
        });

        it('reports what it is dropping', () => {
            const filter = new PacketLogFilter(['SetTimePacket', 'MoveActorAbsolutePacket']);

            expect(filter.getExcluded()).toEqual(['SetTimePacket', 'MoveActorAbsolutePacket']);
        });
    });
});
