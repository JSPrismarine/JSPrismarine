import { describe, expect, it } from 'vitest';
import { EventEmitter } from './EventEmitter';

describe('EventEmitter.hasListeners', () => {
    it('tracks registered, one-shot, and removed handlers', () => {
        const events = new EventEmitter();
        const listener = () => {};

        expect(events.hasListeners('raknetEncapsulatedPacket')).toBe(false);
        events.on('raknetEncapsulatedPacket', listener);
        expect(events.hasListeners('raknetEncapsulatedPacket')).toBe(true);
        events.removeListener('raknetEncapsulatedPacket', listener);
        expect(events.hasListeners('raknetEncapsulatedPacket')).toBe(false);
        events.once('raknetEncapsulatedPacket', listener);
        expect(events.hasListeners('raknetEncapsulatedPacket')).toBe(true);
        events.removeAllListeners('raknetEncapsulatedPacket');
        expect(events.hasListeners('raknetEncapsulatedPacket')).toBe(false);
    });
});
