import { describe, it, expect } from 'vitest';

import CommandRegisterEvent from './CommandRegisterEvent';
import { Command } from '../../command/';

describe('events', () => {
    describe('CommandRegisterEvent', () => {
        it('should construct the event with the provided item', () => {
            const command = new Command({ id: 'test' });
            const event = new CommandRegisterEvent(command);
            expect(event.getCommand()).toBe(command);
        });
    });
});
