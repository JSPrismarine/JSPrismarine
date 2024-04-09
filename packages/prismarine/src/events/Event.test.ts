import { beforeEach, describe, expect, it } from 'vitest';

import { Event } from './Event';

describe('Event', () => {
    let event: Event;

    beforeEach(() => {
        event = new Event();
    });

    it('should not be cancelled by default', () => {
        expect(event.isCancelled()).toBe(false);
    });

    it('should be able to cancel the event', () => {
        event.preventDefault();
        expect(event.isCancelled()).toBe(true);
    });
});
