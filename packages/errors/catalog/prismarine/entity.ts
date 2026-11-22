import { JSPrismarineTypeError } from '@jsprismarine/errors/JSPrismarineError';
import { defineErrors } from '../defineErrors';

/** A logged value had a shape its field never holds. */
export abstract class LoggedFieldError extends JSPrismarineTypeError {
    public override name = 'LoggedFieldError';
}

/** The errors the entity code of `@jsprismarine/prismarine` throws. */
export const PrismarineEntityErrors = defineErrors('prismarine/entity', {
    /**
     * A player's saved game mode is not one of the game modes, so the save or the replay that holds
     * it is damaged.
     */
    InvalidSavedGameMode: { message: 'abilities.gamemode cannot hold {value}', base: TypeError },
    /**
     * An entity's saved field holds a value of the wrong shape, so the save or the replay that
     * holds it is damaged.
     */
    InvalidLoggedField: { message: '{field} cannot hold {value}', base: LoggedFieldError },
    /**
     * A player's saved field holds a value of the wrong shape, so the save or the replay that holds
     * it is damaged.
     */
    InvalidPlayerField: { message: '{field} cannot hold {value}', base: TypeError },
    /** An entity has a status effect Bedrock has no id for, so it cannot be saved or sent. */
    UnsupportedMobEffect: "Cannot serialize unsupported mob effect '{id}'",
    /**
     * A player's saved eating state holds a value of the wrong shape, so the save or the replay
     * that holds it is damaged.
     */
    InvalidSavedMeal: { message: 'consumption.meal cannot hold {value}', base: TypeError },
    /**
     * An entity removed in an undone change could not be restored. This is a bug in the server;
     * report it with the stack trace.
     */
    EntityNotRestored: { message: '{identifier} {id} could not be added back', base: LoggedFieldError },
    /**
     * The server handed out so many entity ids that the next would lose precision. Restart the
     * server.
     */
    RuntimeIdsExhausted: {
        message: 'Entity runtime id counter exceeded Number.MAX_SAFE_INTEGER',
        base: RangeError
    },
    /** A test read the entity runtime before its content was built. */
    EntityRuntimeReadTooEarly: 'the entity runtime was read before the content was built',
    /**
     * An item entity's definition lacks the component that tunes dropped items. The entity data in
     * the loaded packs is incomplete.
     */
    MissingItemComponent: { message: '{identifier} has no {itemComponent} component', base: TypeError },
    /**
     * An entity could not be recorded as plain data for the change log. This is a bug in the
     * server; report it with the stack trace.
     */
    EntityHasNoPlainRecord: { message: '{identifier} {id} has no plain record', base: LoggedFieldError },
    /**
     * Content acted on an entity that is not in the dimension it was asked of. This is a bug in the
     * server; report it with the stack trace.
     */
    EntityNotInDimension: "{identifier} is not in this dimension's entity index, so it has no actuator",
    /**
     * A value written to an entity cannot be recorded as plain data, such as a function or a class
     * instance. This is a bug in the server; report it with the stack trace.
     */
    ValueHasNoPlainForm: { message: 'A logged value has no plain form: {value}', base: TypeError },
    /**
     * An undone removal carries no record to restore the entity from. This is a bug in the server;
     * report it with the stack trace.
     */
    MembershipEntryHasNoRecord: {
        message: 'a membership entry carries no record to add the entity back from',
        base: LoggedFieldError
    },
    /**
     * A villager's saved trades hold a value of the wrong shape, so the save or the replay that
     * holds it is damaged.
     */
    InvalidSavedMerchant: { message: 'merchant cannot hold {value}', base: LoggedFieldError },
    /**
     * A villager's trades could not be recorded as plain data. This is a bug in the server; report
     * it with the stack trace.
     */
    MerchantHasNoPlainForm: { message: 'a merchant snapshot has no plain form', base: LoggedFieldError },
    /**
     * A player's saved mining state holds a value of the wrong shape, so the save or the replay
     * that holds it is damaged.
     */
    InvalidSavedMining: { message: 'mining.block cannot hold {value}', base: TypeError },
    /**
     * An item entity's tuning component has a field that is not a number. The entity data in the
     * loaded packs is malformed.
     */
    ItemComponentFieldNotNumber: { message: '{itemComponent} needs a number for {key}', base: TypeError },
    /**
     * A hanging entity's definition lacks its support kind or check interval. The entity data in
     * the loaded packs is malformed.
     */
    InvalidHangingComponent: {
        message: '{hangingComponent} needs a support of wall or fence and a check_interval',
        base: TypeError
    },
    /**
     * Content reached for entities while no world is loaded, such as during startup or shutdown.
     */
    NoWorldForEntities: 'no world is loaded, so its entities cannot be read or changed',
    /**
     * A change to an entity names a field nothing records. This is a bug in the server; report it
     * with the stack trace.
     */
    NoFieldWriter: { message: 'no writer for {field}', base: LoggedFieldError },
    /**
     * The change log addressed an entity no part of the server holds. This is a bug in the server;
     * report it with the stack trace.
     */
    NoEntityWriter: 'No writer knows {addressed}',
    /**
     * A player's saved spawn point holds a value of the wrong shape, so the save or the replay that
     * holds it is damaged.
     */
    InvalidSavedSpawnPoint: { message: 'respawn.spawnPoint cannot hold {value}', base: TypeError },
    /**
     * A player record was attached to a different entity than its own. This is a bug in the server;
     * report it with the stack trace.
     */
    StorePlayerEntityMismatch: 'store player {id} cannot take entity {entityId}',
    /**
     * A player record was attached twice. This is a bug in the server; report it with the stack
     * trace.
     */
    StorePlayerAlreadyAttached: 'store player {id} is already in a store'
});
