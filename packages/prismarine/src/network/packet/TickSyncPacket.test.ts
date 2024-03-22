import { describe, it, expect } from 'vitest';

import TickSyncPacket from './TickSyncPacket';
import fs from 'node:fs';
import path from 'node:path';

describe('network', () => {
    describe('packet', () => {
        describe('TickSyncPacket', () => {
            const dump = Buffer.from(fs.readFileSync(path.join(process.cwd(), '/.test/dumps/TickSyncPacket.dump')));

            it('decode', () => {
                const pk = new TickSyncPacket();
                (pk as any).buffer = dump;
                pk.decode();

                expect(pk.clientRequestTimestamp).toEqual(BigInt(0xdeadbeef));
                expect(pk.serverReceptionTimestamp).toEqual(BigInt(0xfeedbabe));
            });

            it('encode', () => {
                const pk = new TickSyncPacket();
                pk.clientRequestTimestamp = BigInt(0xdeadbeef);
                pk.serverReceptionTimestamp = BigInt(0xfeedbabe);
                pk.encode();

                expect(dump.equals((pk as any).getBuffer())).toBe(true);
            });
        });
    });
});
