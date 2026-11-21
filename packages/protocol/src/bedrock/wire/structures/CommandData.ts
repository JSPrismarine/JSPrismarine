import type { CommandChainedSubcommand } from './CommandChainedSubcommand';
import type { CommandEnum } from './CommandEnum';
import type CommandParameter from './CommandParameter';

/** One command and its overloads in the command catalog sent by `AvailableCommandsPacket`. */
export default class CommandData {
    /** Command spelling shown by the client and used when it is entered. */
    public commandName = 'commandName';
    /** Human-readable command description shown in command suggestions. */
    public commandDescription = 'commandDescription';
    /** Protocol-defined command flags, encoded as a little-endian uint16. */
    public flags = 0;
    /** Permission level advertised to the client. */
    public permission = 0;
    /** Hard enum of alternate spellings, or `null` when the command has no aliases. */
    public aliases: CommandEnum | null = null;

    /**
     * The chained subcommand tables this command declares, written as
     * `CommandData Chained Subcommand Indexes`. Only `/execute` has any.
     */
    public chainedSubcommands: CommandChainedSubcommand[] = [];

    /** Each array describes one valid sequence of parameters for this command. */
    public overloads: CommandParameter[][] = [];
}
