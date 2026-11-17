/**
 * The world seam: what the script host reads and writes of the world its scripts run in.
 *
 * The server implements {@link ScriptWorld} for each world that runs scripts, and the host never
 * imports a world class ([ADR 0020](../../../../docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md)).
 * Everything crossing it is plain data: ids, strings and numbers
 * ([ADR 0011](../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)). Reads go through
 * getters and writes through the world's own setters. A before-event is a guard the host
 * registers in an action's guard stage ([ADR 0013](../../../../docs/adr/0013-vetoable-actions-are-staged.md)),
 * and an after-event is a change the world committed, which the host takes in the script flush
 * at the end of the tick.
 */

/** The weather as the Script API's `WeatherType` names it. */
export type ScriptWeather = 'Clear' | 'Rain' | 'Thunder';

/** A weather change a script's before-event sees before the world commits it. */
export interface WeatherChangeIntent {
    /** The dimension, as Bedrock names it, such as `minecraft:overworld`. */
    readonly dimension: string;
    readonly previousWeather: ScriptWeather;
    readonly newWeather: ScriptWeather;
    /** How long the new weather lasts, in ticks. */
    readonly duration: number;
}

/** A line of chat a player typed, which a script's before-event sees before anyone gets it. */
export interface ChatSendIntent {
    /** The id of the player who typed it, as {@link ScriptWorld.players} lists it. */
    readonly sender: string;
    readonly message: string;
}

/**
 * What a guard decides: let the action go on, with the intent it may have replaced, or veto it.
 */
export type GuardVerdict<Intent> = { readonly veto: true } | { readonly veto: false; readonly intent: Intent };

/** A guard in an action's guard stage. It reads the intent and writes nothing. */
export type Guard<Intent> = (intent: Intent) => GuardVerdict<Intent>;

/** What a guard of an action no script may change decides: veto it, or let it go on as it is. */
export interface VetoVerdict {
    readonly veto: boolean;
    /** A guard that can only veto hands back no intent. */
    readonly intent?: never;
}

/** A guard that can veto an action but not change it. */
export type VetoGuard<Intent> = (intent: Intent) => VetoVerdict;

/** A position in a dimension, in blocks. */
export interface ScriptVector3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** An entity as the world holds it now, read in one call. */
export interface ScriptEntityState {
    /** The entity's id, which every other read and write names it by. */
    readonly id: string;
    /** Its type, such as `minecraft:armor_stand`. */
    readonly typeId: string;
    /** The dimension it is in, as {@link ScriptWorld.dimensions} names it. */
    readonly dimension: string;
    /** Where its feet are. */
    readonly location: ScriptVector3;
    /** Its name tag; a player's is their name. Empty when it has none. */
    readonly nameTag: string;
    readonly tags: readonly string[];
    /** A player's name. Absent for every other entity. */
    readonly name?: string;
    /** How many slots its inventory has. Absent for an entity without one. */
    readonly inventorySize?: number;
}

/** An item stack as plain data. */
export interface ScriptItem {
    /** The item's type, such as `minecraft:apple`. */
    readonly typeId: string;
    readonly amount: number;
    /** The stack's custom name. Absent when it has none. */
    readonly nameTag?: string;
    /** The lines of lore under its name. Absent or empty when it has none. */
    readonly lore?: readonly string[];
}

/** A block's type and the value of each of its states, as the Script API's `BlockPermutation` holds them. */
export interface ScriptBlockPermutation {
    readonly typeId: string;
    readonly states: Readonly<Record<string, string | number | boolean>>;
}

/** An item type the world knows. */
export interface ScriptItemType {
    /** The type's full id, with its namespace. */
    readonly typeId: string;
    /** How many items one stack holds at most. */
    readonly maxStackSize: number;
}

/** What a command a script ran did: how many times it succeeded, or why it failed. */
export type ScriptCommandResult = { readonly successCount: number } | { readonly error: string };

/** Who a script's command runs as: a dimension, as the server does, or an entity, as `@s`. */
export type ScriptCommandSource = { readonly dimension: string } | { readonly entity: string };

/** How a script's `/scriptevent` was sent, as `ScriptEventSource` names it. */
export type ScriptEventSourceType = 'Block' | 'Entity' | 'NPCDialogue' | 'Server';

/** A change the world committed, for an after-event. */
export type ScriptWorldEvent =
    | ({ readonly type: 'weatherChange' } & Omit<WeatherChangeIntent, 'duration'>)
    /** A player joined and their client finished loading into the world. */
    | { readonly type: 'playerJoin'; readonly playerId: string; readonly playerName: string }
    /** A player appeared in the world, on joining or on respawning. */
    | { readonly type: 'playerSpawn'; readonly playerId: string; readonly initialSpawn: boolean }
    /** A player left; their entity is already gone. */
    | { readonly type: 'playerLeave'; readonly playerId: string; readonly playerName: string }
    /** A `/scriptevent` ran. */
    | {
          readonly type: 'scriptEvent';
          readonly id: string;
          readonly message: string;
          readonly sourceType: ScriptEventSourceType;
          /** The entity that ran it, when an entity did. */
          readonly sourceEntity?: string;
      };

/** A client's answer to a form, which reaches the scripts as an input of the tick it arrived in. */
export interface ScriptFormResponse {
    /** The id of the player who answered, as {@link ScriptWorld.players} lists it. */
    readonly player: string;
    /** The id the form was sent with. */
    readonly formId: number;
    /** The JSON text the client sent, or null when it sent none. */
    readonly response: string | null;
    /** The cancel reason byte the client sent, or null when it sent none. */
    readonly cancelReason: number | null;
}

/** How the scripts' forms reach the world's players, and their answers come back. */
export interface ScriptFormChannel {
    /** Sends a player a form: a `ModalFormRequestPacket` with the id and the JSON as they are. */
    show(player: string, formId: number, json: string): void;
    /** Closes every form a player has open: a `ClientboundCloseFormPacket`. */
    closeAll(player: string): void;
    /** The answers the input step admitted since the last call, in the order they arrived. */
    takeResponses(): readonly ScriptFormResponse[];
}

/** What the script host reads and writes of one world. */
export interface ScriptWorld {
    /** The world's dimensions, as Bedrock names them, such as `minecraft:overworld`. */
    dimensions(): readonly string[];
    /** The ids of the players in the world, in the order they joined. */
    players(): readonly string[];
    /**
     * Puts a line of chat on the screen of every player in the world, or of one.
     * @param player - The id of the one player, as {@link ScriptWorld.players} lists it.
     */
    sendMessage(message: string, player?: string): void;
    /**
     * Reads one entity, a player included.
     * @returns Undefined once the entity is dead or gone, which makes its script object invalid.
     */
    entity(id: string): ScriptEntityState | undefined;
    /** Every entity of a dimension that is loaded, players included, in a fixed order. */
    entities(dimension: string): readonly ScriptEntityState[];
    /**
     * Spawns an entity through the world's own spawn.
     * @param typeId - The type with its namespace.
     * @returns The new entity's id, `unknown-type` for a type the world has no definition of, or
     *   `unloaded` when the location's chunk is not loaded.
     */
    spawnEntity(dimension: string, typeId: string, location: ScriptVector3): string | 'unknown-type' | 'unloaded';
    /** Moves an entity to a location of a dimension, as `/teleport` does. */
    teleport(id: string, dimension: string, location: ScriptVector3): void;
    /**
     * Kills an entity through the world's damage pipeline, as `/kill` does.
     * @returns Whether it died.
     */
    kill(id: string): boolean;
    /** Takes an entity out of the world without killing it, so it drops nothing. */
    remove(id: string): void;
    setNameTag(id: string, nameTag: string): void;
    /** @returns False when the entity already has the tag. */
    addTag(id: string, tag: string): boolean;
    /** @returns False when the entity does not have the tag. */
    removeTag(id: string, tag: string): boolean;
    /**
     * The slots of an entity's inventory, in order, each the stack it holds or null.
     * @returns Undefined for an entity without an inventory.
     */
    inventory(id: string): readonly (ScriptItem | null)[] | undefined;
    /** Puts a stack into one slot of an entity's inventory, or empties it. */
    setInventoryItem(id: string, slot: number, item: ScriptItem | undefined): void;
    /** The lowest block height of a dimension, and the height above its top block. */
    heightRange(dimension: string): { readonly min: number; readonly max: number };
    /**
     * Reads one block.
     * @param location - A block position, in whole numbers.
     * @returns Undefined when its chunk is not loaded.
     */
    block(dimension: string, location: ScriptVector3): ScriptBlockPermutation | undefined;
    /** Sets one block through the world's setter, which tells clients and neighbors. */
    setBlock(dimension: string, location: ScriptVector3, permutation: ScriptBlockPermutation): void;
    /**
     * Completes a block permutation from its type and some of its states, each state left out
     * taking its default.
     * @param typeId - The type with its namespace.
     * @returns Undefined for a type the world does not have, or a state the type does not have.
     *   A state value the type does not allow takes the state's default.
     */
    resolveBlock(
        typeId: string,
        states: Readonly<Record<string, string | number | boolean>>
    ): ScriptBlockPermutation | undefined;
    /**
     * Looks an item type up.
     * @param typeId - The type with its namespace.
     */
    itemType(typeId: string): ScriptItemType | undefined;
    /**
     * Runs a command as `source`, to its end, and tells what it did.
     * @param command - The command without its slash.
     */
    runCommand(command: string, source: ScriptCommandSource): ScriptCommandResult;
    /**
     * Calls `listener` with a player's id while they leave, before their entity goes, for
     * `world.beforeEvents.playerLeave`.
     * @returns A function that stops it.
     */
    watchPlayerLeave(listener: (player: string) => void): () => void;
    /** The weather of a dimension now. */
    weather(dimension: string): ScriptWeather;
    /**
     * Changes a dimension's weather through the world's weather action: its guards run, and a
     * change they let through is committed and taken as a `weatherChange` event later.
     * @param duration - How long, in ticks.
     */
    setWeather(dimension: string, weather: ScriptWeather, duration: number): void;
    /**
     * Adds a guard to the weather action's guard stage.
     * @returns A function that removes it.
     */
    guardWeather(guard: Guard<WeatherChangeIntent>): () => void;
    /**
     * Adds a guard to the chat action of the world's players, which runs before any other
     * player, the console or a plugin gets the line. A veto drops the line. The guard cannot
     * change the line: `ChatSendBeforeEvent.message` is read-only in the Script API.
     * @returns A function that removes it.
     */
    guardChat(guard: VetoGuard<ChatSendIntent>): () => void;
    /** The changes the world committed since the last call, in the order it committed them. */
    takeEvents(): readonly ScriptWorldEvent[];
    /**
     * The wall clock as the input step admitted it for the current tick, in milliseconds since
     * the epoch. `Date` reads this rather than the host's clock, so a replay sees the same dates
     * ([ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)).
     */
    clock(): number;
    /** The channel `@minecraft/server-ui` forms travel over. A world without one sends no form. */
    readonly forms?: ScriptFormChannel;
}
