import { defineErrors } from '../defineErrors';

/** The errors the command code of `@jsprismarine/prismarine` throws. */
export const PrismarineCommandErrors = defineErrors('prismarine/command', {
    /**
     * `/debug` was asked to change a setting that only takes effect at startup. Change it in
     * `config.json` and restart.
     */
    StartupOnlySetting: 'Config key "{key}" can\'t be set at runtime',
    /**
     * The saved random sequences of `/random` list one sequence twice, so the save or the replay
     * that holds it is damaged.
     */
    DuplicateCommandRandomSequenceState: {
        message: 'Duplicate command random sequence state: {entry}',
        base: TypeError
    },
    /** `/debug` was given an action it does not have. */
    UnknownDebugAction: 'Invalid action!',
    /**
     * The saved random sequences of `/random` do not have the shape the server writes, so the save
     * or the replay that holds it is damaged.
     */
    InvalidCommandRandomSequenceState: { message: 'Invalid command random sequence state', base: TypeError },
    /**
     * A saved `/random` sequence does not have the shape the server writes, so the save or the
     * replay that holds it is damaged.
     */
    InvalidNamedCommandRandomSequenceState: { message: 'Invalid named command random sequence state', base: TypeError },
    /**
     * A saved `/random` sequence has a seed that is not a whole number, so the save or the replay
     * that holds it is damaged.
     */
    InvalidRandomSequenceSeed: { message: 'Invalid random sequence seed', base: TypeError },
    /**
     * A saved `/random` stream does not have the shape the server writes, so the save or the replay
     * that holds it is damaged.
     */
    InvalidRandomStreamState: { message: 'Invalid random stream state', base: TypeError },
    /**
     * A saved `/random` sequence's stream does not have the shape the server writes, so the save or
     * the replay that holds it is damaged.
     */
    InvalidNamedRandomStreamState: { message: 'Invalid {sequence} random stream state', base: TypeError },
    /** `/debug` named a world `config.json` does not list. */
    UnknownConfiguredWorld: 'No world {data} in config',
    /** `/debug` named a world that is not loaded. */
    WorldNotLoaded: 'No world {data} is loaded',
    /** `/return` was run outside an `.mcfunction` file, where it has nothing to return from. */
    ReturnOutsideFunction: '/return can only be used inside a function',
    /**
     * `/stop` or `/reload` asked the server to stop, and part of the shutdown failed. The log
     * before this line says which part.
     */
    UncleanShutdown: 'The server did not shut down cleanly',
    /**
     * The command acts on the player who runs it, so the console cannot run it. Run it in game, or
     * use `/execute as` with a player.
     */
    CommandCannotRunFromConsole: "This command can't be run from the console"
});
