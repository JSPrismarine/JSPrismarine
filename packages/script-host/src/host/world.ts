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
    /** Its rotation in degrees: `x` the pitch, `y` the yaw. Absent reads as facing south, level. */
    readonly rotation?: { readonly x: number; readonly y: number };
    /** Where its eyes are. Absent reads as its location. */
    readonly headLocation?: ScriptVector3;
    /** Whether it is sneaking. */
    readonly sneaking?: boolean;
    /** A player's game mode. Absent for every other entity. */
    readonly gameMode?: ScriptGameMode;
    /** The hotbar slot a player holds, from 0 to 8. Absent for every other entity. */
    readonly selectedSlot?: number;
}

/**
 * A dynamic property's value as BDS keeps it: a number, which is a double, a boolean, a string, or
 * a vector whose parts are 32-bit floats.
 */
export type ScriptPropertyValue = number | boolean | string | ScriptVector3;

/** One pack's dynamic properties of one owner, by id, in the order they were first set. */
export type ScriptProperties = ReadonlyMap<string, ScriptPropertyValue>;

/** Whose dynamic properties a script reads or writes: the world's, or an entity's by its id. */
export type ScriptPropertyOwner = 'world' | { readonly entity: string };

/** An item stack as plain data. */
export interface ScriptItem {
    /** The item's type, such as `minecraft:apple`. */
    readonly typeId: string;
    readonly amount: number;
    /** The stack's custom name. Absent when it has none. */
    readonly nameTag?: string;
    /** The lines of lore under its name. Absent or empty when it has none. */
    readonly lore?: readonly string[];
    /** The durability the stack has lost, for an item with durability. Absent or 0 when it has lost none. */
    readonly damage?: number;
    /**
     * The stack's dynamic properties, by the script module UUID of the pack that set them, as BDS
     * keys them on an item. Absent or empty when it has none. Only a stack of one item can hold
     * them.
     */
    readonly dynamicProperties?: ReadonlyMap<string, ScriptProperties>;
}

/** How a scoreboard participant is known, as `ScoreboardIdentityType` names it. */
export type ScriptParticipantType = 'Entity' | 'FakePlayer' | 'Player';

/** A scoreboard participant: a name with no entity, an entity or a player. */
export interface ScriptParticipant {
    /** The id the scoreboard gave it, which a save keeps. */
    readonly id: number;
    readonly type: ScriptParticipantType;
    /** A fake player's name, a player's name, or an entity's id. */
    readonly displayName: string;
    /** The id of its entity, when it is an entity or a player who is in the world. */
    readonly entity?: string;
}

/** Who a scoreboard call names: a fake player by name, an entity by id, or a participant by its id. */
export type ScriptParticipantRef =
    { readonly name: string } | { readonly entity: string } | { readonly participant: number };

/** A scoreboard objective. */
export interface ScriptObjective {
    readonly id: string;
    readonly displayName: string;
}

/** A display slot, as `DisplaySlotId` names it. */
export type ScriptDisplaySlot = 'BelowName' | 'List' | 'Sidebar';

/** What a display slot shows: an objective, and its order, as `ObjectiveSortOrder` numbers it. */
export interface ScriptDisplay {
    readonly objective: string;
    /** 0 for ascending, 1 for descending. */
    readonly sortOrder: 0 | 1;
}

/** The world's one scoreboard, which `/scoreboard` and the scripts share. */
export interface ScriptScoreboard {
    /** Every objective, in the order they were added. */
    objectives(): readonly ScriptObjective[];
    objective(id: string): ScriptObjective | undefined;
    /** @returns False when an objective with the id exists. */
    addObjective(id: string, displayName: string): boolean;
    /** Removes an objective, its scores, and every display slot showing it. @returns False when there is none. */
    removeObjective(id: string): boolean;
    /** Every participant with a score in some objective, in the order they first got one. */
    participants(): readonly ScriptParticipant[];
    /** Finds a participant that has a score in some objective, without making one. */
    participant(ref: ScriptParticipantRef): ScriptParticipant | undefined;
    /** Every score of an objective, by participant, in the order the participants first got one. */
    scores(objective: string): readonly { readonly participant: ScriptParticipant; readonly score: number }[];
    /** A participant's score, or undefined when it has none in the objective. */
    score(objective: string, participant: number): number | undefined;
    /**
     * Writes a score, making the participant when it has none.
     * @param score - A whole number in the 32-bit range.
     * @returns The participant.
     */
    setScore(objective: string, ref: ScriptParticipantRef, score: number): ScriptParticipant;
    /** @returns False when the participant had no score in the objective. */
    removeScore(objective: string, participant: number): boolean;
    /** What a display slot shows, or undefined when it is empty. */
    display(slot: ScriptDisplaySlot): ScriptDisplay | undefined;
    /** Shows an objective in a slot, or empties the slot when `display` is undefined. */
    setDisplay(slot: ScriptDisplaySlot, display: ScriptDisplay | undefined): void;
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
    /** The durability a new stack has, for a type that wears out. Absent for every other type. */
    readonly maxDurability?: number;
}

/** A status effect on an entity, as `Effect` reads it. */
export interface ScriptEffect {
    /** The effect's type, such as `minecraft:speed`. */
    readonly typeId: string;
    /** One below the potency the effect's name shows. */
    readonly amplifier: number;
    /** The ticks left. */
    readonly duration: number;
}

/** A status effect a script adds to an entity. */
export interface ScriptEffectRequest extends ScriptEffect {
    readonly showParticles: boolean;
}

/** One title instruction, as `/title` sends it to a player. */
export type ScriptTitle =
    | { readonly kind: 'title' | 'subtitle' | 'actionbar'; readonly text: string }
    | { readonly kind: 'clear' | 'reset' }
    | {
          readonly kind: 'times';
          /** Ticks the title takes to appear. */
          readonly fadeIn: number;
          /** Ticks the title stays. */
          readonly stay: number;
          /** Ticks the title takes to go. */
          readonly fadeOut: number;
      };

/** A sound a script plays, as `/playsound` plays one. */
export interface ScriptSound {
    /** The sound's name, such as `random.orb`. */
    readonly sound: string;
    readonly dimension: string;
    readonly location: ScriptVector3;
    readonly volume: number;
    readonly pitch: number;
    /** The id of the one player who hears it. Everyone near the location hears it when absent. */
    readonly player?: string;
}

/** A block a player is about to break, which a script's before-event sees before the world does. */
export interface BlockBreakIntent {
    /** The id of the player breaking it, as {@link ScriptWorld.players} lists it. */
    readonly player: string;
    readonly block: ScriptBlockLocation;
    /** The stack in the player's hand. Absent for an empty hand. */
    readonly item?: ScriptItem;
}

/** An item a player is about to use, which a script's before-event sees before the item acts. */
export interface ItemUseIntent {
    /** The id of the player using it, as {@link ScriptWorld.players} lists it. */
    readonly player: string;
    readonly item: ScriptItem;
}

/** An equipment slot, as `EquipmentSlot` names it. */
export type ScriptEquipmentSlot = 'Body' | 'Chest' | 'Feet' | 'Head' | 'Legs' | 'Mainhand' | 'Offhand';

/** What an entity wears and holds, as `EntityEquippableComponent` reads it. */
export interface ScriptEquipment {
    /** The stack in each slot, with an empty slot left out. */
    readonly slots: Readonly<Partial<Record<ScriptEquipmentSlot, ScriptItem>>>;
    /** The armor points the worn pieces give, out of 20 for a full diamond set. */
    readonly armor: number;
    /** The armor toughness the worn pieces give. */
    readonly toughness: number;
}

/** An entity's attribute, such as its health, as an attribute component reads it. */
export interface ScriptAttribute {
    readonly current: number;
    /** The value the entity's type gives it, which `resetToDefaultValue` returns to. */
    readonly default: number;
    readonly min: number;
    readonly max: number;
}

/** How a structure is kept, as `StructureSaveMode` names it. */
export type ScriptStructureSaveMode = 'Memory' | 'World';

/**
 * A structure as plain data: a box of blocks, each an index into its palette, or -1 where the
 * structure has no block, as a structure void leaves one.
 */
export interface ScriptStructure {
    readonly size: ScriptVector3;
    readonly palette: readonly ScriptBlockPermutation[];
    /** The blocks, x outermost, then y, then z, as a `.mcstructure` orders them. */
    readonly blocks: readonly number[];
    readonly saveMode: ScriptStructureSaveMode;
}

/** The structures of a world, by their ids with a namespace, such as `mystructure:house`. */
export interface ScriptStructureStore {
    get(id: string): ScriptStructure | undefined;
    set(id: string, structure: ScriptStructure): void;
    /** @returns False when there was none. */
    delete(id: string): boolean;
    /** Every id, in the order the structures were first kept. */
    ids(): readonly string[];
}

/** A block a player clicks, which a script's before-event sees before the click does anything. */
export interface BlockInteractIntent {
    /** The id of the player clicking, as {@link ScriptWorld.players} lists it. */
    readonly player: string;
    readonly block: ScriptBlockLocation;
    readonly face: ScriptDirection;
    /** Where on the face the click landed, from the block's lowest corner. */
    readonly faceLocation: ScriptVector3;
    /** The stack in the player's hand. Absent for an empty hand. */
    readonly item?: ScriptItem;
}

/** An entity a player clicks, which a script's before-event sees before the click does anything. */
export interface EntityInteractIntent {
    /** The id of the player clicking, as {@link ScriptWorld.players} lists it. */
    readonly player: string;
    readonly target: ScriptEntityRef;
    /** The stack in the player's hand. Absent for an empty hand. */
    readonly item?: ScriptItem;
}

/** What a command a script ran did: how many times it succeeded, or why it failed. */
export type ScriptCommandResult = { readonly successCount: number } | { readonly error: string };

/** Who a script's command runs as: a dimension, as the server does, or an entity, as `@s`. */
export type ScriptCommandSource = { readonly dimension: string } | { readonly entity: string };

/** Why an entity appeared, as `EntityInitializationCause` names it. */
export type ScriptSpawnCause = 'Born' | 'Event' | 'Loaded' | 'Spawned' | 'Transformed';

/** What hurt an entity, as `EntityDamageSource` reads it. */
export interface ScriptDamageSource {
    /** The cause, as `EntityDamageCause` names it, such as `fall` or `entityAttack`. */
    readonly cause: string;
    /** The entity answerable for the blow, such as the archer of an arrow. */
    readonly damagingEntity?: ScriptEntityRef;
    /** The projectile that made contact, when it is not the damaging entity. */
    readonly damagingProjectile?: ScriptEntityRef;
}

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
    /** A player's chat line went past the guards, and the players it reaches got it. */
    | { readonly type: 'chatSend'; readonly sender: string; readonly message: string }
    /** A `/scriptevent` ran. */
    | {
          readonly type: 'scriptEvent';
          readonly id: string;
          readonly message: string;
          readonly sourceType: ScriptEventSourceType;
          /** The entity that ran it, when an entity did. */
          readonly sourceEntity?: string;
      }
    /** An entity appeared in the world. */
    | { readonly type: 'entitySpawn'; readonly entity: ScriptEntityRef; readonly cause: ScriptSpawnCause }
    /** A blow took health off an entity. */
    | {
          readonly type: 'entityHurt';
          readonly entity: ScriptEntityRef;
          /** The health the blow took. */
          readonly damage: number;
          readonly source: ScriptDamageSource;
      }
    /** An entity died. */
    | { readonly type: 'entityDie'; readonly entity: ScriptEntityRef; readonly source: ScriptDamageSource }
    /** A player broke a block. */
    | {
          readonly type: 'playerBreakBlock';
          readonly player: string;
          readonly block: ScriptBlockLocation;
          readonly brokenBlockPermutation: ScriptBlockPermutation;
          /** The stack in the player's hand before the break. Absent for an empty hand. */
          readonly itemBefore?: ScriptItem;
          /** The stack in the player's hand after the break. Absent for an empty hand. */
          readonly itemAfter?: ScriptItem;
      }
    /** A player used an item that the before-event let through. */
    | { readonly type: 'itemUse'; readonly player: string; readonly item: ScriptItem }
    /** A player's click on a block went past the before-event and did something. */
    | ({
          readonly type: 'playerInteractWithBlock';
          /** The stack in the player's hand after the click. Absent for an empty hand. */
          readonly itemAfter?: ScriptItem;
      } & BlockInteractIntent)
    /** A player's click on an entity went past the before-event and did something. */
    | ({
          readonly type: 'playerInteractWithEntity';
          /** The stack in the player's hand after the click. Absent for an empty hand. */
          readonly itemAfter?: ScriptItem;
      } & EntityInteractIntent);

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

/** An HTTP method, as `@minecraft/server-net`'s `HttpRequestMethod` names it. */
export type ScriptHttpMethod = 'Delete' | 'Get' | 'Head' | 'Patch' | 'Post' | 'Put';

/** One HTTP request a script sent, as the network gets it. */
export interface ScriptHttpRequest {
    /** An `http` or `https` URI. */
    readonly uri: string;
    readonly method: ScriptHttpMethod;
    /** The headers in the order the script added them, each secret's text in place of its `SecretString`. */
    readonly headers: readonly (readonly [string, string])[];
    /** The body; a `Get` or `Head` request sends none. */
    readonly body: string;
    /** Seconds before the request is abandoned; 0 for no limit. */
    readonly timeout: number;
}

/**
 * How one request ended: the response the server sent, or the error that ended it, by the code
 * BDS's HTTP client reports, such as 111 for a refused connection.
 */
export type ScriptHttpResult =
    | {
          readonly id: number;
          readonly status: number;
          /** The response headers in the order they arrived, each name in lower case. */
          readonly headers: readonly (readonly [string, string])[];
          readonly body: string;
      }
    | { readonly id: number; readonly errorCode: number };

/**
 * How the scripts' `@minecraft/server-net` requests reach the network, and their results come
 * back. The network runs off the tick, and a result is an input: it enters the world in a later
 * tick's input step, which records it, so a replay gets it back without the network
 * ([ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)).
 */
export interface ScriptHttpChannel {
    /**
     * Starts a request off the tick.
     * @param id - The request's id, which its result carries. The runtime counts them from 1 and never reuses one.
     */
    send(id: number, request: ScriptHttpRequest): void;
    /** Abandons a request in flight; its result, if one comes, is dropped. */
    cancel(id: number): void;
    /** The results the input step admitted since the last call, in the order it admitted them. */
    takeResponses(): readonly ScriptHttpResult[];
}

/** Where `@minecraft/server-admin`'s `transferPlayer` sends a player. */
export type ScriptTransferTarget =
    { readonly hostname: string; readonly port: number } | { readonly netherNetId: string };

/** The classes of `@minecraft/debug-utilities`' shapes, by the name the Script API gives each. */
export type ScriptDebugShapeKind =
    | 'DebugArrow'
    | 'DebugBox'
    | 'DebugCircle'
    | 'DebugCone'
    | 'DebugCylinder'
    | 'DebugEllipsoid'
    | 'DebugLine'
    | 'DebugPyramid'
    | 'DebugSphere'
    | 'DebugText';

/** A color with alpha, each part from 0 to 1 as a script gives it, though nothing clamps it. */
export interface ScriptRgba {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
    readonly alpha: number;
}

/** A pair of numbers, such as a cone's radii along X and Z. */
export interface ScriptVector2 {
    readonly x: number;
    readonly y: number;
}

/**
 * A debug shape as the world draws it, from what a script set on a `@minecraft/debug-utilities`
 * shape. Each class's own properties are present for that class only. Floats hold what a 32-bit
 * float keeps of the script's number, as BDS's do.
 */
export interface ScriptDebugShape {
    readonly kind: ScriptDebugShapeKind;
    readonly location: ScriptVector3;
    /** The dimension it is drawn in, when the shape or `addShape` names one. */
    readonly dimension?: string;
    readonly color: ScriptRgba;
    readonly scale: number;
    /** Pitch, yaw and roll, as the script gave them. */
    readonly rotation: ScriptVector3;
    /** The seconds left before the shape goes, as the tick counts them; absent for a shape that stays. */
    readonly timeLeft?: number;
    readonly maximumRenderDistance?: number;
    /** The id of the entity the shape follows, as {@link ScriptWorld.entity} takes it. */
    readonly attachedTo?: string;
    /** A line's or an arrow's other end. */
    readonly endLocation?: ScriptVector3;
    readonly headLength?: number;
    readonly headRadius?: number;
    readonly headSegments?: number;
    /** A box's extent. */
    readonly bound?: ScriptVector3;
    /** A cone's or a cylinder's radii along X and Z, or an ellipsoid's along X, Y and Z. */
    readonly radii?: ScriptVector2 | ScriptVector3;
    readonly height?: number;
    /** A cone's or a cylinder's segments. */
    readonly numSegments?: number;
    readonly segmentsPerAxis?: number;
    /** A pyramid's base. */
    readonly width?: number;
    readonly depth?: number;
    /** A text's words, with a `RawMessage` read as chat reads one. */
    readonly text?: string;
    readonly useRotation?: boolean;
    readonly backgroundColorOverride?: ScriptRgba;
    readonly lineGapHeight?: number;
    readonly depthTest?: boolean;
    readonly backfaceVisible?: boolean;
    readonly textBackfaceVisible?: boolean;
}

/**
 * One change to the debug shapes a world draws: a shape to draw, or to draw again as it now is,
 * or, without `shape`, one to stop drawing.
 */
export interface ScriptDebugShapeChange {
    /** The shape's id, unique in the world for as long as the world's scripts run. */
    readonly id: number;
    readonly shape?: ScriptDebugShape;
}

/** A game mode as the Script API's `GameMode` names it. */
export type ScriptGameMode = 'Adventure' | 'Creative' | 'Spectator' | 'Survival';

/**
 * What a script tells a GameTest simulated player to do. Each is what a client's input would do
 * for a real player, and a move or a look lasts until another replaces it.
 */
export type SimulatedPlayerAction =
    /** Types a line of chat, which goes past the chat guards as a client's line does. */
    | { readonly kind: 'chat'; readonly message: string }
    /** Jumps, when the player stands on the ground. */
    | { readonly kind: 'jump' }
    /**
     * Walks in a direction until told to stop: `x` toward the east and `z` toward the south, or,
     * when `relative`, `x` to the player's left and `z` forward from where they face.
     */
    | {
          readonly kind: 'move';
          readonly x: number;
          readonly z: number;
          readonly speed: number;
          readonly relative: boolean;
      }
    | { readonly kind: 'stopMoving' }
    /** Turns the player's head and body to face a location. */
    | { readonly kind: 'lookAt'; readonly location: ScriptVector3 }
    /** Swings at the entity the player faces within reach. */
    | { readonly kind: 'attack' }
    /** Swings at one entity, when it is within reach. */
    | { readonly kind: 'attackEntity'; readonly entity: string }
    /** Uses an item in the air, as a client's right click does. */
    | { readonly kind: 'useItem'; readonly item: ScriptItem }
    /** Breaks a block, through the guards a client's break goes through, retrying each tick while one vetoes it. */
    | { readonly kind: 'breakBlock'; readonly location: ScriptVector3 };

/**
 * The GameTest simulated players of a world: players with no client, which every script,
 * command and other player sees as a player ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)).
 */
export interface ScriptSimulatedPlayers {
    /**
     * Adds a player with no client to the world, in the tick the call is made.
     * @returns The new player's id, as {@link ScriptWorld.players} lists it, or undefined when
     *   the world cannot place a player there.
     */
    spawn(name: string, dimension: string, location: ScriptVector3, gameMode: ScriptGameMode): string | undefined;
    /** Takes a simulated player out of the world, as a client's disconnect does. */
    remove(id: string): void;
    /**
     * Makes a simulated player act.
     * @returns Whether the action happened, such as a jump from the ground or a swing that hit.
     */
    act(id: string, action: SimulatedPlayerAction): boolean;
    /** Moves the simulated players one tick on: their walks and jumps. */
    tick(): void;
}

/** A custom command's parameter type, as `CustomCommandParamType` names it. */
export type ScriptCommandParamType =
    | 'BlockType'
    | 'Boolean'
    | 'EntitySelector'
    | 'EntityType'
    | 'Enum'
    | 'Float'
    | 'Integer'
    | 'ItemType'
    | 'Location'
    | 'PlayerSelector'
    | 'String';

/** One parameter of a custom command. */
export interface ScriptCommandParameter {
    readonly name: string;
    readonly type: ScriptCommandParamType;
    /** The registered enum an `Enum` parameter takes its values from. */
    readonly enumName?: string;
}

/** A command a script registered in `startup`, as the world's command tree takes it. */
export interface ScriptCustomCommand {
    /** The name with its namespace, such as `jsp:hello`. BDS also answers to it without one. */
    readonly name: string;
    readonly description: string;
    /** The `CommandPermissionLevel` it needs: 0 for anyone up to 4 for the owner. */
    readonly permissionLevel: number;
    readonly cheatsRequired: boolean;
    readonly mandatoryParameters: readonly ScriptCommandParameter[];
    readonly optionalParameters: readonly ScriptCommandParameter[];
}

/** An enum a script registered for its commands' `Enum` parameters. */
export interface ScriptCommandEnum {
    /** The name with its namespace, which a parameter names. */
    readonly name: string;
    readonly values: readonly string[];
}

/** An entity a command argument or a hook names: its id, and its type, which picks its class. */
export interface ScriptEntityRef {
    readonly id: string;
    readonly typeId: string;
}

/**
 * One argument of a custom command as the world parsed it: a string for `String` and `Enum`, a
 * number for `Integer` and `Float`, a boolean, or the location, entities or type the others name.
 */
export type ScriptCommandArgument =
    | string
    | number
    | boolean
    | { readonly kind: 'location'; readonly location: ScriptVector3 }
    | { readonly kind: 'entities'; readonly entities: readonly ScriptEntityRef[] }
    | { readonly kind: 'entityType' | 'itemType' | 'blockType'; readonly id: string };

/** Who ran a custom command, as `CustomCommandOrigin` reads it. */
export interface ScriptCommandOrigin {
    readonly sourceType: ScriptEventSourceType;
    /** The entity the command runs as, absent for the server. */
    readonly sourceEntity?: ScriptEntityRef;
    /** The player who talked to the NPC that ran it. */
    readonly initiator?: ScriptEntityRef;
}

/** What a custom command's callback answered, which the world tells the sender. */
export interface ScriptCommandOutcome {
    readonly status: 'success' | 'failure';
    /** The message the sender is shown. Absent when the callback gave none. */
    readonly message?: string;
}

/** The custom commands the scripts registered in `startup`, and the way to run one. */
export interface ScriptCommandSet {
    readonly commands: readonly ScriptCustomCommand[];
    readonly enums: readonly ScriptCommandEnum[];
    /**
     * Runs a command's callback, in restricted execution, while the command runs.
     * @param name - The command's full name, as {@link ScriptCustomCommand.name} gives it.
     * @param args - The arguments in parameter order, mandatory ones first, without the ones left out.
     */
    run(name: string, origin: ScriptCommandOrigin, args: readonly ScriptCommandArgument[]): ScriptCommandOutcome;
}

/** A face of a block, as the Script API's `Direction` names it. */
export type ScriptDirection = 'Down' | 'East' | 'North' | 'South' | 'Up' | 'West';

/** A custom component a block or item names, with the parameters it gives it. */
export interface ScriptComponentUse {
    /** The component's name with its namespace. */
    readonly name: string;
    /** The parameters a version 2 block or item gives the component, as JSON data. */
    readonly params?: unknown;
    /**
     * Whether a block names it in `minecraft:custom_components`, as the formats before version 2
     * did. Such a block gets no parameters and none of the hooks Mojang added after it, such as
     * `onBreak`, as the `custom-components` scenario recorded on BDS.
     */
    readonly legacy?: boolean;
}

/** A block position in a dimension. */
export interface ScriptBlockLocation extends ScriptVector3 {
    readonly dimension: string;
}

/** A block hook the world raises for the custom components a block names. */
export type ScriptBlockHookEvent = {
    readonly components: readonly ScriptComponentUse[];
    readonly block: ScriptBlockLocation;
} & (
    | { readonly hook: 'onPlace'; readonly previousBlock: ScriptBlockPermutation }
    | {
          readonly hook: 'onBreak';
          readonly brokenBlockPermutation: ScriptBlockPermutation;
          readonly entitySource?: ScriptEntityRef;
      }
    | {
          readonly hook: 'onPlayerBreak';
          readonly brokenBlockPermutation: ScriptBlockPermutation;
          readonly player?: ScriptEntityRef;
      }
    | {
          readonly hook: 'onPlayerInteract';
          readonly player?: ScriptEntityRef;
          readonly face: ScriptDirection;
          readonly faceLocation?: ScriptVector3;
      }
    | {
          readonly hook: 'beforeOnPlayerPlace';
          readonly player?: ScriptEntityRef;
          readonly face: ScriptDirection;
          readonly permutationToPlace: ScriptBlockPermutation;
      }
    | { readonly hook: 'onTick' | 'onRandomTick' }
);

/** An item hook the world raises for the custom components an item names. */
export type ScriptItemHookEvent = {
    readonly components: readonly ScriptComponentUse[];
    /** The stack the hook is about, as it was when the world raised it. */
    readonly item: ScriptItem;
    /** The entity using the item. */
    readonly source: ScriptEntityRef;
} & (
    | { readonly hook: 'onUse' | 'onCompleteUse' | 'onConsume' }
    | {
          readonly hook: 'onUseOn';
          readonly block: ScriptBlockLocation;
          readonly usedOnBlockPermutation: ScriptBlockPermutation;
          readonly blockFace: ScriptDirection;
          readonly faceLocation: ScriptVector3;
      }
    | { readonly hook: 'onHitEntity'; readonly hitEntity: ScriptEntityRef; readonly hadEffect: boolean }
    | {
          readonly hook: 'onMineBlock';
          readonly block: ScriptBlockLocation;
          readonly minedBlockPermutation: ScriptBlockPermutation;
      }
);

/** The block hooks a custom component can have, as {@link ScriptBlockHookEvent} names them. */
export type ScriptBlockHook = ScriptBlockHookEvent['hook'];

/** The item hooks a custom component can have, as {@link ScriptItemHookEvent} names them. */
export type ScriptItemHook = ScriptItemHookEvent['hook'];

/**
 * Where the world sends the hooks of the custom components its blocks and items name. A hook a
 * script can cancel runs at once, as a guard of the action it is about
 * ([ADR 0013](../../../../docs/adr/0013-vetoable-actions-are-staged.md)); every other hook waits
 * for the script flush at the end of the tick, as on BDS.
 */
export interface ScriptComponentSink {
    /** Whether a script registered one of the components with the hook, so the world can skip building an event. */
    handlesBlock(components: readonly ScriptComponentUse[], hook: ScriptBlockHook): boolean;
    /** Whether a script registered one of the components with the hook. */
    handlesItem(components: readonly ScriptComponentUse[], hook: ScriptItemHook): boolean;
    /**
     * Raises a block hook.
     * @returns Whether a script canceled it, which only `beforeOnPlayerPlace` can.
     */
    block(event: ScriptBlockHookEvent): boolean;
    /** Raises an item hook. */
    item(event: ScriptItemHookEvent): void;
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
    /**
     * One pack's dynamic properties of the world or of an entity.
     * @param pack - The pack's header UUID, which BDS keys a world's and an entity's properties by.
     * @returns Undefined for an entity that is gone.
     */
    dynamicProperties(owner: ScriptPropertyOwner, pack: string): ScriptProperties | undefined;
    /**
     * Writes some of one pack's dynamic properties of the world or of a live entity through the
     * world's setter: each value replaces the property's, and undefined deletes it.
     * @param pack - The pack's header UUID.
     */
    setDynamicProperties(
        owner: ScriptPropertyOwner,
        pack: string,
        values: ReadonlyMap<string, ScriptPropertyValue | undefined>
    ): void;
    /** Deletes every dynamic property one pack set on the world or on a live entity. */
    clearDynamicProperties(owner: ScriptPropertyOwner, pack: string): void;
    /** The world's scoreboard, which `/scoreboard` shares. */
    readonly scoreboard: ScriptScoreboard;
    /** The channel `@minecraft/server-ui` forms travel over. A world without one sends no form. */
    readonly forms?: ScriptFormChannel;
    /** The channel `@minecraft/server-net` requests travel over. A world without one fails each request. */
    readonly http?: ScriptHttpChannel;
    /** Sends a player to another server, as `/transfer` does. A world without it transfers no one. */
    transferPlayer?(id: string, target: ScriptTransferTarget): void;
    /**
     * Draws, redraws or removes `@minecraft/debug-utilities` shapes for every player, once per
     * script flush that changed any. A world without it draws none, and the scripts still read
     * their shapes back the same.
     */
    drawDebugShapes?(changes: readonly ScriptDebugShapeChange[]): void;
    /** The world's GameTest simulated players. A world without them refuses to spawn one. */
    readonly simulatedPlayers?: ScriptSimulatedPlayers;
    /**
     * Places a GameTest's `.mcstructure` with its lowest corner at a location. A world that cannot
     * read the format leaves the blocks there as they are.
     * @param structure - The file's bytes.
     */
    placeStructure?(dimension: string, location: ScriptVector3, structure: Uint8Array): void;
    /** Sets a player's game mode, as `/gamemode` does. */
    setGameMode?(id: string, gameMode: ScriptGameMode): void;
    /** Makes an entity sneak or stand, and tells the clients that see it. */
    setSneaking?(id: string, sneaking: boolean): void;
    /** Sends a player a title instruction, as `/title` does. A world without it shows no title. */
    showTitle?(player: string, title: ScriptTitle): void;
    /** Plays a sound, as `/playsound` does. A world without it plays none. */
    playSound?(sound: ScriptSound): void;
    /**
     * Spawns a particle effect for the players near a location, as `/particle` does, or for one player.
     * @param molangVariables - The JSON of the effect's MoLang variables, as `SpawnParticleEffectPacket` carries it.
     * @param player - The id of the one player who sees it. Everyone near the location sees it when absent.
     */
    spawnParticle?(
        dimension: string,
        effect: string,
        location: ScriptVector3,
        molangVariables?: string,
        player?: string
    ): void;
    /** Whether the world knows a status effect type, such as `minecraft:speed`. */
    isEffectType?(typeId: string): boolean;
    /**
     * The status effects on an entity, in the order they were added.
     * @returns Undefined for an entity that is gone.
     */
    effects?(id: string): readonly ScriptEffect[] | undefined;
    /**
     * Adds a status effect to an entity, as `/effect` does: one that is no stronger and no longer
     * than the effect it already has changes nothing.
     */
    addEffect?(id: string, effect: ScriptEffectRequest): void;
    /** @returns False when the entity has no such effect. */
    removeEffect?(id: string, typeId: string): boolean;
    /**
     * The slots of the container a block holds, such as a chest's, each the stack it holds or null.
     * @returns Undefined for a block that holds none, or one in a chunk that is not loaded.
     */
    blockInventory?(dimension: string, location: ScriptVector3): readonly (ScriptItem | null)[] | undefined;
    /** Puts a stack into one slot of a block's container, or empties it. */
    setBlockInventoryItem?(
        dimension: string,
        location: ScriptVector3,
        slot: number,
        item: ScriptItem | undefined
    ): void;
    /**
     * Adds a guard to the block breaking of the world's players, which runs before the block goes.
     * A veto leaves the block where it is.
     * @returns A function that removes it.
     */
    guardBlockBreak?(guard: VetoGuard<BlockBreakIntent>): () => void;
    /**
     * Adds a guard to the item use of the world's players, which runs before the item acts. A veto
     * stops the use.
     * @returns A function that removes it.
     */
    guardItemUse?(guard: VetoGuard<ItemUseIntent>): () => void;
    /**
     * Adds a guard to the block clicks of the world's players, which runs before the click opens,
     * uses or places anything. A veto drops the click.
     * @returns A function that removes it.
     */
    guardBlockInteract?(guard: VetoGuard<BlockInteractIntent>): () => void;
    /**
     * Adds a guard to the entity clicks of the world's players, which runs before the click does
     * anything. A veto drops the click.
     * @returns A function that removes it.
     */
    guardEntityInteract?(guard: VetoGuard<EntityInteractIntent>): () => void;
    /**
     * What an entity wears and holds.
     * @returns Undefined for an entity that is gone or has no equipment a script reaches, which
     *   is any but a player, as on BDS.
     */
    equipment?(id: string): ScriptEquipment | undefined;
    /**
     * Puts a stack into one equipment slot, or empties it, and tells the clients that see it.
     * @returns False when the slot cannot hold the stack, such as an apple on the chest.
     */
    setEquipment?(id: string, slot: ScriptEquipmentSlot, item: ScriptItem | undefined): boolean;
    /**
     * One of an entity's attributes.
     * @param name - The attribute component's id, such as `minecraft:health`.
     * @returns Undefined for an entity that is gone or whose type has no such attribute.
     */
    attribute?(id: string, name: string): ScriptAttribute | undefined;
    /** Writes an attribute's value, within its bounds, and tells the clients that see it. */
    setAttribute?(id: string, name: string, value: number): void;
    /**
     * Every dimension type the world registers, as Bedrock names them, in the order of their
     * numeric ids. A world without it lists its dimensions.
     */
    dimensionTypes?(): readonly string[];
    /** Every status effect type the world knows, by its id with a namespace. */
    effectTypes?(): readonly string[];
    /** The world's structures, which `world.structureManager` reads and writes. A world without them keeps none. */
    readonly structures?: ScriptStructureStore;
    /** Moves a player's hand to a hotbar slot, from 0 to 8, and tells their client. */
    setSelectedSlot?(id: string, slot: number): void;
    /**
     * Hurts an entity through the world's damage pipeline, as `/damage` does.
     * @param amount - The blow, before armor and resistance.
     * @returns Whether the blow landed. A blow no stronger than the one the entity is still
     *   recovering from lands without taking health, and one at a dead entity does not land.
     */
    applyDamage?(id: string, amount: number, source: ScriptDamageSource): boolean;
    /**
     * Puts the custom commands the scripts registered into the world's command tree, after
     * `startup`. A world without it has no custom commands.
     * @returns A function that takes them out again, which a reload calls before it registers anew.
     */
    registerCommands?(commands: ScriptCommandSet): () => void;
    /**
     * Sends the hooks of the custom components the world's blocks and items name to `sink`, once
     * the scripts have registered them. A world without it raises no hook.
     * @returns A function that stops it.
     */
    bindComponents?(sink: ScriptComponentSink): () => void;
}
