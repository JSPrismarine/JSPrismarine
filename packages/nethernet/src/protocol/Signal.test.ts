import { describe, expect, it } from 'vitest';

import { SignalStructure, SignalType } from './Signal';

describe('NetherNet signals', () => {
    it('round-trips every type, keeping the spaces and newlines inside the data', () => {
        for (const type of Object.values(SignalType)) {
            const signal = new SignalStructure(
                type,
                18_446_744_073_709_551_615n,
                'v=0\r\na=candidate:1 1 udp 1 a b typ host'
            );
            const parsed = SignalStructure.fromString(signal.toString());

            expect([parsed.type, parsed.connectionId, parsed.data]).toStrictEqual([
                type,
                signal.connectionId,
                signal.data
            ]);
        }
    });

    it('reads a signal with no data', () => {
        expect(SignalStructure.fromString('CONNECTERROR 5').data).toBe('');
    });

    it('refuses an unknown type or a connection ID that is not a number', () => {
        expect(() => SignalStructure.fromString('HELLO 1 x')).toThrow('Unknown NetherNet signal type');
        expect(() => SignalStructure.fromString('CANDIDATEADD -1 x')).toThrow('is not a number');
    });
});
