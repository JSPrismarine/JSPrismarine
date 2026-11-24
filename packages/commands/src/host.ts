/**
 * The seam between the command set and the server.
 *
 * Every command in this package is a Brigadier tree plus one or more calls
 * into `CommandHost`. Nothing here imports the server, reads a world, or
 * knows what an entity is beyond the handful of fields a command needs, so
 * the command layer can be tested against a plain object and reused by
 * anything that can answer these questions.
 *
 * `CommandSource` is Java's `CommandSourceStack`: the entity, position,
 * rotation, dimension and anchor a command runs with, plus the `with*`
 * methods `/execute` uses to derive a new one. Each returns a copy, because a
 * forked `execute as @e` runs the rest of the chain once per source and must
 * not share mutable state between branches.
 */
import type { SelectorDialect, SelectorModel } from './selector';

/** A position in a dimension. */
export interface Vector3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** A facing, in degrees. */
export interface Rotation {
    readonly yaw: number;
    readonly pitch: number;
}

/** Which point of an entity a command measures from. */
export type EntityAnchor = 'eyes' | 'feet';

/** What a command needs to know about an entity it has selected. */
export interface EntityRef {
    /** A stable id the host can resolve back to its own entity object. */
    readonly id: string;
    /** The namespaced entity type, `minecraft:pig`. */
    readonly type: string;
    /** The name a selector's `name=` matches and a message addresses. */
    readonly name: string;
    readonly isPlayer: boolean;
    readonly position: Vector3;
    readonly rotation: Rotation;
    readonly dimension: string;
}

/** A block, as `/setblock` and `execute if block` talk about one. */
export interface BlockRef {
    /** The namespaced block identifier. */
    readonly identifier: string;
    /** The block states, as a Bedrock `["name"="value"]` list parses into. */
    readonly states: Readonly<Record<string, string | number | boolean>>;
}

/** The three ways `/setblock` and `/fill` treat what is already there. */
export type BlockPlacementMode = 'replace' | 'keep' | 'destroy' | 'hollow' | 'outline';

/** The two ways `/clone` picks which blocks to copy. */
export type CloneMaskMode = 'replace' | 'masked' | 'filtered';

/** The three ways `/clone` treats the source region. */
export type CloneMode = 'normal' | 'force' | 'move';

/** What has item slots: a container block, or an entity. `/item`, `/loot replace` and `/replaceitem` address one. */
export type SlotTarget =
    | { readonly kind: 'block'; readonly dimension: string; readonly position: Vector3 }
    | { readonly kind: 'entity'; readonly entity: EntityRef };

/** Where `/data` and `execute if data` read from: something with slots, or a command storage. */
export type DataTarget = SlotTarget | { readonly kind: 'storage'; readonly id: string };

/** The five `/data modify` operations. */
export type DataModifyOperation = 'append' | 'insert' | 'merge' | 'prepend' | 'set';

/**
 * Where `/data modify` takes the tags it writes from.
 *
 * `value` is one SNBT tag typed on the command line. `from` reads another
 * target: its whole compound, or every tag `path` matches there, which can be
 * several, as Java's `resolveSourcePath` reads them.
 */
export type DataModifySource =
    | { readonly kind: 'value'; readonly snbt: string }
    | { readonly kind: 'from'; readonly target: DataTarget; readonly path?: string };

/** What `/data get` read. */
export interface DataValue {
    /** The tag, printed as SNBT the way `/data get` shows it. */
    readonly snbt: string;
    /**
     * The number the command returns, which is Java's: with a scale,
     * `floor(value * scale)` of a numeric tag; with none, `floor(value)` of a
     * numeric tag, the size of a list, an array or a compound, or the length
     * of a string. A read of the whole target returns 1.
     */
    readonly result: number;
}

/** What `/item`, `/loot replace` and `/replaceitem` address. */
export interface ItemSlot {
    /**
     * The slot name: Java's (`container.0`, `weapon.mainhand`, `armor.*`) or Bedrock's group
     * (`slot.hotbar`), which starts with `slot.`.
     */
    readonly name: string;
    /** How many slots on from this one `/loot replace … <count>` writes. */
    readonly count?: number;
    /**
     * The position inside a multi-slot group.
     *
     * Java names one slot with one string, `container.3`. Bedrock splits the
     * two, `/replaceitem entity @s slot.hotbar 3`, so the index travels beside
     * the name rather than being parsed back out of it.
     */
    readonly index?: number;
}

/**
 * How a slot write treats what is there, and how one stack spreads over the slots a name such as
 * `container.*` covers.
 *
 * - `replace` puts the stacks into the slots in order and leaves the slots past the last stack
 *   alone, which is Java's `/item replace` and Bedrock's default.
 * - `destroy` is Bedrock's explicit spelling of `replace`.
 * - `keep` leaves an occupied slot alone, which is Bedrock's other `/replaceitem` mode.
 * - `fill` repeats the stacks until every slot has one, which is Java's `/item fill`.
 * - `override` puts the stacks in order and empties every slot past the last one, which is
 *   Java's `/item override`.
 */
export type SlotWriteMode = 'destroy' | 'fill' | 'keep' | 'override' | 'replace';

/** What `execute store` writes a result into. */
export type StoreTarget =
    | { readonly kind: 'block'; readonly dimension: string; readonly position: Vector3; readonly path: string }
    | { readonly kind: 'entity'; readonly entity: EntityRef; readonly path: string }
    | { readonly kind: 'storage'; readonly id: string; readonly path: string }
    | { readonly kind: 'score'; readonly holder: string; readonly objective: string }
    | { readonly kind: 'bossbar'; readonly id: string; readonly field: 'value' | 'max' };

/** The entity relationships `execute on` walks. */
export type EntityRelation =
    'attacker' | 'controller' | 'leasher' | 'origin' | 'owner' | 'passengers' | 'target' | 'vehicle';

/** The entity-side verbs a command needs. */
export interface EntityCommandHost {
    /** Resolves a selector against the world, in the source's frame of reference. */
    select(selector: SelectorModel, source: CommandSource): readonly EntityRef[];
    /** Follows one of `execute on`'s eight relationships. */
    related(entity: EntityRef, relation: EntityRelation): readonly EntityRef[];
    summon(
        type: string,
        position: Vector3,
        rotation: Rotation,
        options: {
            nbt?: string;
            name?: string;
            /** Dimension of the command source, including changes made by `/execute in`. */
            dimension?: string;
        }
    ): EntityRef | undefined;
    kill(entity: EntityRef): boolean;
    /**
     * Applies `/damage`.
     * @param damageType - A damage type id such as `minecraft:in_fire`; `minecraft:generic` by default.
     * @param origin - Who and where it came from. Without it the blow has no source entity, which is
     * what Java does for a bare `/damage`, whoever ran the command.
     */
    damage(entity: EntityRef, amount: number, damageType: string, origin?: DamageOrigin): boolean;
    teleport(entity: EntityRef, position: Vector3, rotation: Rotation, dimension: string): boolean;
    /** Mounts `rider` on `vehicle`, or dismounts it when `vehicle` is undefined. */
    ride(rider: EntityRef, vehicle: EntityRef | undefined): boolean;
    setGameMode(player: EntityRef, gameMode: string): boolean;
    /** @returns How many items were actually given. */
    giveItem(player: EntityRef, item: string, count: number, data: number): number;
    /** @returns How many items were removed. */
    clearItems(player: EntityRef, item: string | undefined, data: number | undefined, maxCount: number): number;
    /** @returns How many items match, without removing any of them. */
    countItems(player: EntityRef, item: string | undefined, data: number | undefined): number;
    addEffect(entity: EntityRef, effect: string, seconds: number, amplifier: number, hideParticles: boolean): boolean;
    /** @returns How many effects were cleared. */
    clearEffect(entity: EntityRef, effect?: string): number;
    enchant(entity: EntityRef, enchantment: string, level: number): boolean;
    /**
     * Adds to, or replaces, a player's experience.
     *
     * @param mode - `add` is `/xp add` and `set` is `/xp set`. The two differ
     *   by more than arithmetic: Java's `set ... points` writes the bar
     *   fraction rather than adding points that carry into a level.
     * @returns The player's experience after the change, in `unit`.
     */
    changeExperience(player: EntityRef, amount: number, unit: 'points' | 'levels', mode: 'add' | 'set'): number;
    queryExperience(player: EntityRef, unit: 'points' | 'levels'): number;
    addTag(entity: EntityRef, tag: string): boolean;
    removeTag(entity: EntityRef, tag: string): boolean;
    listTags(entity: EntityRef): readonly string[];
    getAttributeBase(entity: EntityRef, attribute: string): number | undefined;
    setAttributeBase(entity: EntityRef, attribute: string, value: number): boolean;
    getAttributeValue(entity: EntityRef, attribute: string): number | undefined;
    addAttributeModifier(
        entity: EntityRef,
        attribute: string,
        id: string,
        value: number,
        operation: 'add_value' | 'add_multiplied_base' | 'add_multiplied_total'
    ): boolean;
    removeAttributeModifier(entity: EntityRef, attribute: string, id: string): boolean;
    getAttributeModifier(entity: EntityRef, attribute: string, id: string): number | undefined;
}

/** The world-side verbs a command needs. */
export interface WorldCommandHost {
    getBlock(dimension: string, position: Vector3): BlockRef | undefined;
    setBlock(dimension: string, position: Vector3, block: BlockRef, mode: BlockPlacementMode): boolean;
    /** @returns How many blocks changed. */
    fill(
        dimension: string,
        from: Vector3,
        to: Vector3,
        block: BlockRef,
        mode: BlockPlacementMode,
        filter?: BlockRef
    ): number;
    /** @returns How many blocks were copied. */
    clone(
        dimension: string,
        begin: Vector3,
        end: Vector3,
        destination: Vector3,
        maskMode: CloneMaskMode,
        mode: CloneMode,
        filter?: BlockRef
    ): number;
    /** @returns How many blocks of the region match the other region. */
    compareRegions(dimension: string, begin: Vector3, end: Vector3, destination: Vector3, masked: boolean): number;
    /** The time of day in ticks, which stands still while the day cycle is off. */
    getTime(): number;
    /** The game clock in ticks, which never stops. */
    getGameTime(): number;
    /** Sets the time of day. */
    setTime(ticks: number): void;
    addTime(ticks: number): number;
    getWeather(): 'clear' | 'rain' | 'thunder';
    setWeather(weather: 'clear' | 'rain' | 'thunder', durationTicks?: number): void;
    getGameRule(name: string): string | number | boolean | undefined;
    setGameRule(name: string, value: string | number | boolean): boolean;
    getDifficulty(): string;
    setDifficulty(difficulty: string): boolean;
    setWorldSpawn(dimension: string, position: Vector3, angle: number): boolean;
    setSpawnPoint(player: EntityRef, dimension: string, position: Vector3, angle: number): boolean;
    /**
     * The nearest structure, biome or point of interest by name, for `/locate`.
     *
     * @param name - What was typed: an id with or without its namespace, or a `#tag`.
     * @returns The nearest match, or undefined when the search found none. A structure's y is
     * not a height; Java prints it as `~`.
     */
    locate(kind: 'structure' | 'biome' | 'poi', name: string, origin: Vector3, dimension: string): Vector3 | undefined;
    /**
     * Every id and `#tag` a `/locate <kind>` may name here, offered as suggestions on top of
     * Mojang's published list. Empty for a host with no registry of its own behind the kind.
     */
    locateNames(kind: 'structure' | 'biome' | 'poi', dimension: string): readonly string[];
    /** @returns Whether the feature, jigsaw, structure or template was placed. */
    place(kind: string, name: string, position: Vector3, dimension: string): boolean;
    particle(name: string, position: Vector3, dimension: string, parameters?: string): boolean;
    playSound(sound: string, listeners: readonly EntityRef[], position: Vector3, volume: number, pitch: number): number;
    stopSound(listeners: readonly EntityRef[], sound?: string): number;
    /** @returns How many players were moved. */
    spreadPlayers(
        dimension: string,
        center: { x: number; z: number },
        spreadDistance: number,
        maxRange: number,
        respectTeams: boolean,
        targets: readonly EntityRef[]
    ): number;
    /** The heightmap value `execute positioned over` reads. */
    heightmap(dimension: string, position: Vector3, kind: string): number;
    /** The biome id `execute if biome` compares. */
    getBiome(dimension: string, position: Vector3): string | undefined;
    /** Whether the chunk at the position is loaded, for `execute if loaded`. */
    isLoaded(dimension: string, position: Vector3): boolean;
    /** The dimensions `/execute in` and `/teleport` accept. */
    dimensions(): readonly string[];
    /**
     * The dimension `/execute in` moves a source to, from the source's dimension and the one the
     * command names. A host whose dimensions belong to more than one world, and carry which in
     * the dimension string, keeps the source's there. Absent, it is the dimension named.
     */
    dimensionIn?(current: string, named: string): string;
    /**
     * The ticking areas `/tickingarea` adds, lists and removes. A host without them leaves the
     * command out.
     */
    readonly tickingAreas?: TickingAreaCommandHost;
}

/** A ticking area as `/tickingarea list` reports it. */
export interface CommandTickingArea {
    readonly name: string;
    readonly dimension: string;
    /** The lowest corner of the chunks it covers, in blocks. */
    readonly from: Vector3;
    /** The highest corner of the chunks it covers, in blocks. */
    readonly to: Vector3;
    readonly preload: boolean;
}

/** The ticking area verbs `/tickingarea` needs, over the command's own areas. */
export interface TickingAreaCommandHost {
    /**
     * Adds an area over the chunks a block box covers.
     * @param name - The area's name, or undefined for one the host picks.
     * @returns The area's name, `in-use` for a name taken, or `limit` when the command has as
     *   many areas as it may.
     */
    add(
        dimension: string,
        from: Vector3,
        to: Vector3,
        name: string | undefined,
        preload: boolean
    ): string | 'in-use' | 'limit';
    /** Removes the areas with a name, or the ones over a position, and returns the names removed. */
    remove(dimension: string, target: { readonly name: string } | { readonly position: Vector3 }): readonly string[];
    /** Removes every area of a dimension, and returns the names removed. */
    removeAll(dimension: string): readonly string[];
    /** The areas of a dimension, or of every dimension when it is undefined. */
    list(dimension: string | undefined): readonly CommandTickingArea[];
    /** Sets whether the areas named, or over a position, preload, and returns the names changed. */
    setPreload(
        dimension: string,
        target: { readonly name: string } | { readonly position: Vector3 },
        preload: boolean
    ): readonly string[];
}

/** The scoreboard verbs a command needs. */
export interface ScoreboardCommandHost {
    addObjective(name: string, criterion: string, displayName?: string): boolean;
    removeObjective(name: string): boolean;
    listObjectives(): readonly string[];
    setDisplay(slot: string, objective?: string, sortOrder?: 'ascending' | 'descending'): boolean;
    /**
     * Every holder the board tracks, which is what a `*` score holder names.
     *
     * @param objective - Narrows it to the holders with a score in that one.
     */
    holders(objective?: string): readonly string[];
    getScore(holder: string, objective: string): number | undefined;
    setScore(holder: string, objective: string, value: number): number;
    addScore(holder: string, objective: string, value: number): number;
    resetScore(holder: string, objective?: string): boolean;
    listScores(holder: string): Readonly<Record<string, number>>;
    /** @returns The target's score after the operation, or undefined when it did not apply. */
    operation(
        target: string,
        targetObjective: string,
        operation: string,
        source: string,
        sourceObjective: string
    ): number | undefined;
    enableTrigger(holder: string, objective: string): boolean;
}

/** The NBT, loot and function verbs a command needs. */
export interface DataCommandHost {
    /**
     * Reads the target's data, or the one tag a path names in it.
     *
     * @param path - The NBT path. Without one, the whole compound is read.
     * @param scale - What `/data get … <scale>` multiplies by. With one, the
     *   tag must be numeric.
     * @returns The tag and the command's result, or undefined when the path
     *   matches nothing.
     * @throws When the path matches more than one tag, or a scale is given
     *   and the tag is not numeric.
     */
    getData(target: DataTarget, path?: string, scale?: number): DataValue | undefined;
    /** @returns How many elements the path matched. */
    countData(target: DataTarget, path: string): number;
    /** @returns Whether the merge changed anything. */
    mergeData(target: DataTarget, nbt: string): boolean;
    /**
     * Writes tags at a path, which is `/data modify` and `execute store`.
     *
     * @param index - Where `insert` puts the tags. Negative counts from the end.
     * @returns How many tags changed; 0 when the data already held them.
     */
    modifyData(
        target: DataTarget,
        path: string,
        operation: DataModifyOperation,
        source: DataModifySource,
        index?: number
    ): number;
    /** @returns How many tags the path matched and removed. */
    removeData(target: DataTarget, path: string): number;
    /**
     * Counts the slots a slot source selects on every source, which is `execute if slots`.
     *
     * @param slots - Java's `slot_source` argument: a slot name such as `weapon.mainhand`, the
     *   id or `#tag` of a datapack's slot source, or one written as SNBT.
     * @param source - Who runs the command, which a source's `this` names.
     * @returns How many slots were selected, empty ones included, as Java counts them.
     */
    countSlots(sources: readonly SlotTarget[], slots: string, source: CommandSource): number;
    /**
     * Counts the items in the slots a slot source selects on every source that pass an item
     * predicate, which is `execute if items`.
     *
     * @param slots - Java's `slot_source` argument; see {@link countSlots}.
     * @param predicate - Java's `item_predicate` argument: an id, a `#tag` or `*`, with optional
     *   component tests in brackets.
     * @returns The summed counts of the matching stacks. A source without the slot adds nothing.
     */
    countSlotItems(sources: readonly SlotTarget[], slots: string, predicate: string, source: CommandSource): number;
    /**
     * Applies a standalone item modifier to the items in the slots a name covers, on every target.
     *
     * @returns How many slots changed.
     * @throws When the name is not a slot, or no target has it.
     */
    applyItemModifier(targets: readonly SlotTarget[], slot: ItemSlot, modifier: string): number;
    /**
     * Puts an item stack into the slots a name covers, on every target.
     *
     * @param targets - What `/item` or `/replaceitem` addressed. A target without the slot is
     *   skipped, as Java skips it.
     * @param mode - What to do with what is there, and how the stack spreads over a wildcard;
     *   see {@link SlotWriteMode}. `replace` is the default.
     * @returns How many slots were written.
     * @throws When the name is not a slot, or no target has it.
     */
    setSlot(targets: readonly SlotTarget[], slot: ItemSlot, item: string, count: number, mode?: SlotWriteMode): number;
    /**
     * Copies the stacks in the slots a name covers on the sources into the slots another name
     * covers on every target, which is `/item replace|fill|override … from`.
     *
     * @param sources - Where the stacks are read, in order: each source's slots, empty ones
     *   included, one after another.
     * @param mode - How the stacks spread over the target slots. `replace` is the default.
     * @param modifier - An item modifier each stack goes through on the way.
     * @returns How many slots were written.
     * @throws When either name is not a slot, no source has its slot, or no target has its slot.
     */
    copySlots(
        sources: readonly SlotTarget[],
        fromSlot: ItemSlot,
        targets: readonly SlotTarget[],
        toSlot: ItemSlot,
        mode?: Exclude<SlotWriteMode, 'destroy' | 'keep'>,
        modifier?: string
    ): number;
    /**
     * Rolls loot and delivers it.
     *
     * @param loot - What to roll. `/loot kill` and `/loot mine` roll the table
     *   of the entity or block they name rather than one the player typed, so
     *   the four forms are a model rather than a table id.
     * @returns How many items were delivered.
     */
    runLoot(loot: LootSource, source: CommandSource, destination: LootDestination): number;
    /** Evaluates a datapack predicate, for `execute if predicate`. */
    testPredicate(predicate: string, source: CommandSource): boolean;
    /**
     * Runs a function or `#tag`; see {@link FunctionOutcome} for the two things a call reports.
     * @param nbt - The argument compound as SNBT, for a macro function.
     * @param stored - Whether `nbt` is a stored compound printed back, as `/function … with`
     *   passes it, rather than text a player typed. A printed `Infinityd` then reads as the
     *   number it was, where typed it reads as a string, as Java's reader does.
     */
    runFunction(name: string, source: CommandSource, nbt?: string, stored?: boolean): FunctionOutcome;
    /**
     * Ends the function the running command line belongs to, which is
     * `/return`.
     *
     * @param value - What the function returns. Undefined for `return fail`
     *   and for a `return run` whose command failed, both of which end the
     *   function without a value.
     * @returns What the `/return` line itself reports, which is the value, or
     *   0 when there is none.
     * @throws When no function is running. Java refuses `/return` typed at a
     *   console or a chat window the same way.
     */
    returnFromFunction(value: number | undefined): number;
    /** Queues a function for later. */
    schedule(name: string, delayTicks: number, mode: 'append' | 'replace'): boolean;
    clearSchedule(name: string): number;
    /** Draws from a named random sequence, as `/random` does. */
    randomValue(min: number, max: number, sequence?: string): number;
    resetRandomSequence(sequence: string | '*', seed?: number): boolean;
}

/**
 * What running a function or a function tag produced.
 *
 * Two commands read a call and they want different answers, so neither
 * field derives from the other. `/function` reports `result`; Java made it
 * the `/return` value in 1.20.3 and the number of lines run before that, and
 * it is still both depending on whether the function reached a `/return`.
 * `execute if function` reads `matched`, which Java defines as "returned a
 * non-zero value through `/return`", so a function that ran 40 lines and
 * never returned reports 40 and does not match.
 */
export interface FunctionOutcome {
    /**
     * What `/function` reports and `execute store result` captures: the sum
     * of the values `/return` produced, or the number of command lines that
     * ran when nothing the call reached returned a value.
     */
    readonly result: number;
    /**
     * Whether any function the call ran returned a non-zero value through
     * `/return`. A tag matches when any of its members did, which is why
     * this is not `result !== 0`: members returning 1 and -1 sum to 0 and
     * still match.
     */
    readonly matched: boolean;
}

/**
 * What `/loot` rolls.
 *
 * Java's four sources, and only the first names a table outright. `kill`
 * rolls the table of the entity it names, `mine` rolls the table of the block
 * at the position, and `fish` rolls a named table with the position and tool
 * the fishing conditions read - so a host handed a bare table id could answer
 * only one of the four.
 */
export type LootSource =
    /** `loot <table>`: the table, rolled with the command's own position as its origin. */
    | { readonly kind: 'table'; readonly table: string }
    /** `fish <table> <pos> [<tool>]`: a named table with a position and a tool. */
    | {
          readonly kind: 'fish';
          readonly table: string;
          readonly dimension: string;
          readonly position: Vector3;
          /** An item id, or `mainhand` or `offhand`, which read off the source entity. */
          readonly tool?: string;
      }
    /** `kill <target>`: whatever that entity would drop if it died now. */
    | { readonly kind: 'kill'; readonly entity: EntityRef }
    /** `mine <pos> [<tool>]`: whatever that block would drop if the tool broke it. */
    | {
          readonly kind: 'mine';
          readonly dimension: string;
          readonly position: Vector3;
          readonly tool?: string;
      };

/** Where `/loot` puts what a loot table produced. */
export type LootDestination =
    | { readonly kind: 'give'; readonly players: readonly EntityRef[] }
    | { readonly kind: 'insert'; readonly dimension: string; readonly position: Vector3 }
    | { readonly kind: 'spawn'; readonly dimension: string; readonly position: Vector3 }
    | { readonly kind: 'replace'; readonly targets: readonly SlotTarget[]; readonly slot: ItemSlot };

/**
 * What one `/title` or `/titleraw` line asks the client to draw.
 *
 * One model rather than a text argument and a flag, because the three forms
 * carry different data: a slot takes text, `clear` and `reset` take none, and
 * `times` takes three durations and no text at all. Spelling them as one
 * string with ignored parameters is how a `times` call silently becomes a
 * title reading "20".
 */
export type TitleInstruction =
    | {
          readonly kind: 'title' | 'subtitle' | 'actionbar';
          readonly text: string;
          /** True when `text` is a `rawtext` JSON object, as `/titleraw` sends. */
          readonly raw?: boolean;
      }
    | { readonly kind: 'clear' | 'reset' }
    | {
          readonly kind: 'times';
          readonly fadeIn: number;
          readonly stay: number;
          readonly fadeOut: number;
      };

/** What `/camerashake` asks a client to do. */
export interface CameraShake {
    readonly action: 'add' | 'stop';
    readonly intensity: number;
    readonly seconds: number;
    readonly shakeType: 'positional' | 'rotational';
}

/**
 * One change to a player's fog stack, as `/fog` makes it.
 *
 * The packet carries the whole stack, so the server is the thing that
 * remembers it; `userId` is the name a later `pop` or `remove` refers to the
 * layer by.
 */
export type FogChange =
    | { readonly mode: 'push'; readonly fogId: string; readonly userId: string }
    | { readonly mode: 'pop' | 'remove'; readonly userId: string };

/** What `/playanimation` asks a client to draw, beside the animation itself. */
export interface AnimationRequest {
    readonly animation: string;
    readonly nextState?: string;
    readonly blendOutTime?: number;
    readonly stopExpression?: string;
    readonly controller?: string;
}

/** What `/tick` asks of the tick loop. */
export interface TickCommandHost {
    /** The ticks per second the loop aims for. */
    rate(): number;
    setRate(rate: number): void;
    /** How long a tick's work has been taking, in milliseconds, averaged over recent ticks. */
    tickMs(): number;
    /** The measured ticks per second. */
    measuredRate(): number;
    frozen(): boolean;
    setFrozen(frozen: boolean): void;
    /** @returns False when the world is not frozen. */
    step(ticks: number): boolean;
    /** @returns False when no step was running. */
    stopStep(): boolean;
    sprint(ticks: number): void;
    /** @returns False when no sprint was running. */
    stopSprint(): boolean;
}

/** One player on the allow list, as `/allowlist list` prints it. */
export interface AllowListCommandEntry {
    readonly name?: string;
    readonly xuid?: string;
    /** Whether the player may join a full server. */
    readonly ignoresPlayerLimit: boolean;
}

/** What `/allowlist` asks of the server's allow list. */
export interface AllowListCommandHost {
    /** @returns False when the name is on the list already. */
    add(name: string): boolean;
    /** @returns False when the name is not on the list. */
    remove(name: string): boolean;
    entries(): readonly AllowListCommandEntry[];
    /**
     * Turns the list on or off.
     *
     * @returns False when it cannot be turned on because players are not authenticated online,
     *   which Bedrock Dedicated Server refuses as well.
     */
    setEnabled(enabled: boolean): boolean;
    /** Reads the list's file again. */
    reload(): void;
}

/** The administrative verbs a command needs. */
export interface ServerCommandHost {
    readonly allowList: AllowListCommandHost;
    addOperator(player: EntityRef): boolean;
    removeOperator(player: EntityRef): boolean;
    kick(player: EntityRef, reason: string): boolean;
    listPlayers(): readonly EntityRef[];
    stop(): void;
    reload(): void;
    readonly ticking: TickCommandHost;
    transfer(player: EntityRef, host: string, port: number): boolean;
    /** Unlocks or locks recipes for players. */
    recipes(players: readonly EntityRef[], recipe: string, give: boolean): number;
    /** Sends chat text. `kind` picks the message form the client renders. */
    sendMessage(targets: readonly EntityRef[], kind: 'chat' | 'whisper' | 'emote' | 'raw', text: string): void;
    /** Sends a title, subtitle, action bar, clear, reset or timing change. */
    sendTitle(targets: readonly EntityRef[], title: TitleInstruction): void;
    /**
     * Shakes the players' cameras.
     *
     * @returns How many players were shaken.
     */
    shakeCamera(players: readonly EntityRef[], shake: CameraShake): number;
    /**
     * Changes the players' fog stack.
     *
     * @returns How many stacks changed; a `pop` of a layer nobody pushed
     *   changes none.
     */
    setFog(players: readonly EntityRef[], change: FogChange): number;
    /**
     * Plays a one-off animation on entities.
     *
     * @returns How many entities were asked to play it.
     */
    playAnimation(entities: readonly EntityRef[], request: AnimationRequest): number;
    /**
     * Builds the paged list or command-route help `/help` prints.
     *
     * @param target - A page number or command route, or undefined for page 1.
     * @returns The formatted help lines.
     */
    usage(target?: string): readonly string[];
}

/** The optional source clauses of `/damage <target> <amount> <type> [at <location>] [by <entity> [from <cause>]]`. */
export interface DamageOrigin {
    /** `by`: the entity that made contact, such as an arrow or the attacker's fist. */
    readonly by?: EntityRef;
    /** `from`: the entity answerable for `by`, such as the archer. */
    readonly from?: EntityRef;
    /** `at`: the point the blow came from. */
    readonly at?: Vector3;
}

/** Everything a command in this package can ask the server to do. */
export interface CommandHost {
    readonly entities: EntityCommandHost;
    readonly world: WorldCommandHost;
    readonly scoreboard: ScoreboardCommandHost;
    readonly data: DataCommandHost;
    readonly server: ServerCommandHost;
}

/**
 * What `execute store` attaches to a derived source so the value a later
 * command produces reaches a score, an NBT path or a boss bar.
 *
 * Upstream Brigadier carries this as a `CommandResultCallback` on the source;
 * the port predates `ContextChain`, so the dispatcher's `ResultConsumer`
 * feeds the sinks instead. See `storeCommandResults`.
 */
export interface CommandResultSink {
    /** Whether the command succeeded, and the number it returned. */
    (outcome: { readonly success: boolean; readonly value: number }): void;
}

/**
 * Java's `CommandSourceStack`: who is running a command, from where, and with
 * what authority.
 *
 * Every `with*` method returns a copy. `execute as @e` runs the rest of the
 * chain once per matched entity, and sharing mutable state between those
 * branches would make the result depend on evaluation order.
 */
export interface CommandSource {
    readonly host: CommandHost;
    /** The entity the command runs as, absent for the console. */
    readonly entity?: EntityRef;
    /**
     * The player who typed the command, absent for the console and for a command the server runs
     * for a script or a function. `execute as` changes `entity` and keeps this, so a gate on who
     * typed the command reads this and not `entity`.
     */
    readonly caller?: EntityRef;
    /**
     * The name a source with no entity speaks as, such as a command block's custom name. `/say`
     * and `/me` fall back to `Server` without one.
     */
    readonly name?: string;
    readonly position: Vector3;
    readonly rotation: Rotation;
    readonly dimension: string;
    readonly anchor: EntityAnchor;
    /** 0 to 5, compared against a command's `CommandPermissionLevel`. */
    readonly permissionLevel: number;
    /** True inside a function, where output does not reach chat. */
    readonly silent: boolean;
    /** Which grammar a selector in this command's arguments is read with. */
    readonly dialect: SelectorDialect;
    /** The `execute store` sinks waiting for this command's result. */
    readonly stores: readonly CommandResultSink[];

    withEntity(entity: EntityRef | undefined): CommandSource;
    withPosition(position: Vector3): CommandSource;
    withRotation(rotation: Rotation): CommandSource;
    withDimension(dimension: string): CommandSource;
    withAnchor(anchor: EntityAnchor): CommandSource;
    withSilent(silent: boolean): CommandSource;
    /** Adds an `execute store` sink, keeping the ones already attached. */
    withStore(sink: CommandResultSink): CommandSource;

    /** Reports success to whoever ran the command, unless the source is silent. */
    sendFeedback(message: string): void;
    /** Reports a failure, which is never suppressed. */
    sendError(message: string): void;
}

/** The fields {@link createCommandSource} needs, everything else having a default. */
export interface CommandSourceInput {
    readonly host: CommandHost;
    readonly entity?: EntityRef;
    readonly name?: string;
    /** The player who typed the command; see `CommandSource.caller`. Absent when nobody did. */
    readonly caller?: EntityRef;
    readonly position?: Vector3;
    readonly rotation?: Rotation;
    readonly dimension?: string;
    readonly anchor?: EntityAnchor;
    readonly permissionLevel?: number;
    readonly silent?: boolean;
    readonly dialect?: SelectorDialect;
    /** Where feedback goes. The default drops it. */
    readonly onFeedback?: (message: string) => void;
    /** Where errors go. The default drops them. */
    readonly onError?: (message: string) => void;
}

interface SourceState {
    readonly host: CommandHost;
    readonly entity?: EntityRef;
    readonly name?: string;
    readonly caller?: EntityRef;
    readonly position: Vector3;
    readonly rotation: Rotation;
    readonly dimension: string;
    readonly anchor: EntityAnchor;
    readonly permissionLevel: number;
    readonly silent: boolean;
    readonly dialect: SelectorDialect;
    readonly stores: readonly CommandResultSink[];
    readonly onFeedback: (message: string) => void;
    readonly onError: (message: string) => void;
}

const ORIGIN: Vector3 = { x: 0, y: 0, z: 0 };
const FORWARD: Rotation = { yaw: 0, pitch: 0 };

class StackCommandSource implements CommandSource {
    public constructor(private readonly state: SourceState) {}

    public get host(): CommandHost {
        return this.state.host;
    }

    public get caller(): EntityRef | undefined {
        return this.state.caller;
    }

    public get entity(): EntityRef | undefined {
        return this.state.entity;
    }

    public get name(): string | undefined {
        return this.state.name;
    }

    public get position(): Vector3 {
        return this.state.position;
    }

    public get rotation(): Rotation {
        return this.state.rotation;
    }

    public get dimension(): string {
        return this.state.dimension;
    }

    public get anchor(): EntityAnchor {
        return this.state.anchor;
    }

    public get permissionLevel(): number {
        return this.state.permissionLevel;
    }

    public get silent(): boolean {
        return this.state.silent;
    }

    public get dialect(): SelectorDialect {
        return this.state.dialect;
    }

    public get stores(): readonly CommandResultSink[] {
        return this.state.stores;
    }

    private derive(change: Partial<SourceState>): CommandSource {
        return new StackCommandSource({ ...this.state, ...change });
    }

    public withEntity(entity: EntityRef | undefined): CommandSource {
        // `execute as` moves the entity without moving the position, which is
        // why `as` and `at` are separate subcommands.
        return this.derive({ entity });
    }

    public withPosition(position: Vector3): CommandSource {
        return this.derive({ position });
    }

    public withRotation(rotation: Rotation): CommandSource {
        return this.derive({ rotation });
    }

    public withDimension(dimension: string): CommandSource {
        return this.derive({ dimension });
    }

    public withAnchor(anchor: EntityAnchor): CommandSource {
        return this.derive({ anchor });
    }

    public withSilent(silent: boolean): CommandSource {
        return this.derive({ silent });
    }

    public withStore(sink: CommandResultSink): CommandSource {
        return this.derive({ stores: [...this.state.stores, sink] });
    }

    public sendFeedback(message: string): void {
        if (!this.state.silent) this.state.onFeedback(message);
    }

    public sendError(message: string): void {
        this.state.onError(message);
    }
}

/**
 * Builds a command source.
 *
 * @param input - The host is required; the console's origin, zero rotation,
 *   the overworld, the `feet` anchor, permission level 0, not silent and the
 *   Java selector grammar are the defaults.
 */
export const createCommandSource = (input: CommandSourceInput): CommandSource =>
    new StackCommandSource({
        host: input.host,
        ...(input.entity === undefined ? {} : { entity: input.entity }),
        ...(input.caller === undefined ? {} : { caller: input.caller }),
        ...(input.name === undefined ? {} : { name: input.name }),
        position: input.position ?? input.entity?.position ?? ORIGIN,
        rotation: input.rotation ?? input.entity?.rotation ?? FORWARD,
        dimension: input.dimension ?? input.entity?.dimension ?? 'minecraft:overworld',
        anchor: input.anchor ?? 'feet',
        permissionLevel: input.permissionLevel ?? 0,
        silent: input.silent ?? false,
        dialect: input.dialect ?? 'java',
        stores: [],
        onFeedback: input.onFeedback ?? (() => {}),
        onError: input.onError ?? (() => {})
    });
