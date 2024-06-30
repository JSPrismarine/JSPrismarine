import type { Command } from '../../command/Command';
import { Event } from '../Event';

export default class CommandRegisterEvent extends Event {
    private readonly Command;

    /**
     * Construct the event.
     * @param {Command} command - command The command that was registered.
     * @returns {CommandRegisterEvent} The event.
     */
    public constructor(command: Command) {
        super();
        this.Command = command;
    }

    /**
     * Get the command that was registered.
     * @returns {Command} The command that was registered.
     */
    public getCommand(): Command {
        return this.Command;
    }
}
