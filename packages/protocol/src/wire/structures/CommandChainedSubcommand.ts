/**
 * One `Chained Subcommand Data` table of `AvailableCommandsPacket`.
 *
 * A chained subcommand is how Bedrock expresses `/execute`, and nothing else: an overload
 * whose tail is "and then another subcommand" ends in a parameter pointing at one of these
 * tables, and the table lists the keywords that may follow. Mojang added the four fields
 * together at protocol 594 (1.20.10) and uses a single table, `EXECUTECHAINEDOPTION_0`, in 17
 * places across its own command set.
 *
 * The table is numbered in its own index space, separate from both the hard and the soft enum
 * tables, even though a parameter refers to it with the same `Enum` and `Valid` flags. The
 * `EnumAsChainedCommand` option bit is what tells a client which space the index is in.
 */
export class CommandChainedSubcommand {
    /** The table's name, which Mojang spells `EXECUTECHAINEDOPTION_0`. */
    public name!: string;

    /** The subcommand keywords that may follow. */
    public values!: string[];
}
