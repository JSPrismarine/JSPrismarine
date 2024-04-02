import type { Command } from '../../command/Command';
import Event from '../Event';

export default class CommandRegisterEvent extends Event {
    private readonly Command;

    public constructor(command: Command) {
        super();
        this.Command = command;
    }

    public getCommand(): Command {
        return this.Command;
    }
}
