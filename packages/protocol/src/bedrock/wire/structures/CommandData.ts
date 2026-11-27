import type { CommandChainedSubcommand } from './CommandChainedSubcommand';
import type { CommandEnum } from './CommandEnum';
import type CommandParameter from './CommandParameter';

/**
 * Bits of the `CommandData.Flags` word.
 *
 * Mojang documents the word as a `uint16` and does not list its bits. The ones here are read off
 * what a Bedrock Dedicated Server 1.26.60 sends (`bedrock-data/src/jsp/v2225/wire/0x4c.bin`).
 */
export enum CommandDataFlags {
    NONE = 0,
    /**
     * The command is not a cheat, so a client runs it in a world with cheats off. The server
     * sets it on `/me`, `/tell`, `/list` and `/gamerule`, and leaves it off `/gamemode` and
     * `/give`. A client whose `StartGame` said `commandsEnabled: false` refuses a command without
     * it and answers that cheats are off, without sending the request; Geyser met this when it
     * turned achievements on (GeyserMC/Geyser#4894).
     */
    NOT_CHEAT = 0x80
}

/** One command and its overloads in the command catalog sent by `AvailableCommandsPacket`. */
export default class CommandData {
    /** Command spelling shown by the client and used when it is entered. */
    public commandName = 'commandName';
    /** Human-readable command description shown in command suggestions. */
    public commandDescription = 'commandDescription';
    /** Protocol-defined command flags, {@link CommandDataFlags}, encoded as a little-endian uint16. */
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
