import type { CommandChainedSubcommand } from './CommandChainedSubcommand';
import type { CommandEnum } from './CommandEnum';
import type CommandParameter from './CommandParameter';

export default class CommandData {
    public commandName = 'commandName';
    public commandDescription = 'commandDescription';
    public flags = 0;
    public permission = 0;
    public aliases: CommandEnum | null = null;

    /**
     * The chained subcommand tables this command declares, written as
     * `CommandData Chained Subcommand Indexes`. Only `/execute` has any.
     */
    public chainedSubcommands: CommandChainedSubcommand[] = [];

    public overloads: CommandParameter[][] = [];
}
