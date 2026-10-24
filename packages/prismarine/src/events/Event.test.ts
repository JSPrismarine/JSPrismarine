import { beforeEach, describe, expect, it } from 'vitest';

import { Event } from './Event';

describe('events', () => {
    describe('Event', () => {
        let event: Event;

        beforeEach(() => {
            event = new Event();
        });

        it('should not be canceled by default', () => {
            expect(event.isCanceled()).toBe(false);
        });

        it('should be able to cancel the event', () => {
            event.preventDefault();
            expect(event.isCanceled()).toBe(true);
        });
    });
});
