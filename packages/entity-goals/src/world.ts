import type {
    EntityInstance,
    EntityPosition,
    FilterEntityView,
    FilterItemView,
    ShareablesParams
} from '@jsprismarine/entities';

import type { NavigationView } from './navigation/view';

/**
 * What a goal needs from the world beyond `EntityActuator`.
 *
 * `EntityActuator` in `@jsprismarine/entities` covers position, movement and
 * look control. The 170 vanilla goals also attack, search for blocks, pick up
 * items, mount, trade, breed and teleport, and nothing in the entity runtime
 * reaches any of that. This is the second seam the server implements.
 *
 * Every member is optional, which follows the convention `FilterEntityView`
 * sets: a goal whose world cannot answer a member it needs refuses to start
 * rather than throwing, so a server brings the seam up a member at a time and
 * the goals that already work keep working.
 */

/** One other entity a goal can see, compare a filter against, or act on. */
export interface GoalMob {
    /** A stable identity, so a goal can tell two candidates apart between ticks. */
    readonly id: string | number;
    /** Where it is now. */
    position(): EntityPosition;
    /** Where its eyes are, when the world can provide that detail. */
    lookPosition?(): EntityPosition;
    /** Its filter view, which is what an `entity_types` filter evaluates against as `other`. */
    view(): FilterEntityView;
    /** Its entity type, such as `minecraft:villager_v2`. */
    identifier?(): string | undefined;
    /** What it holds in its main hand, for tempt, beg, barter and the item goals. */
    heldItem?(): string | undefined;
    /** Its inventory, when the world can read it, for data-driven item sharing. */
    inventory?(): readonly string[];
    /** Its inventory slots and flat items together, for `minecraft:behavior.share_items`. */
    shareInventory?(): readonly string[];
    /** Its active item-sharing rules, when it has `minecraft:shareables`. */
    shareables?(): ShareablesParams | undefined;
    /** Its current health, for the attack goals that stop at a threshold. */
    health?(): number | undefined;
    /** What it is attacking, which is what the owner-revenge goals read. */
    target?(): GoalMob | undefined;
    /** Who last damaged it, which is what `owner_hurt_by_target` reads. */
    lastDamager?(): GoalMob | undefined;
    /**
     * The mob it last hurt and the game tick it did, Java's `getLastHurtMob` and
     * `getLastHurtMobTimestamp`, which `owner_hurt_target` reads.
     */
    lastHurt?(): GoalCombatMark | undefined;
    /**
     * The mob that last hurt it and the game tick it did, Java's `getLastHurtByMob` and
     * `getLastHurtByMobTimestamp`, forgotten 100 ticks later as Java forgets it.
     */
    lastHurtBy?(): GoalCombatMark | undefined;
    /** Its owner, when it is tamed, which `hurt_by_target` compares before it alerts it. */
    owner?(): GoalMob | undefined;
    /** Its place in a fish school, which `minecraft:flocking` reads and changes. */
    school?(): SchoolMembership | undefined;
}

/** One blow a mob remembers: the other side of it, and the game tick it landed. */
export interface GoalCombatMark {
    readonly mob: GoalMob;
    readonly tick: number;
}

/**
 * One mob's place in a fish school: Java's `AbstractSchoolingFish.leader` and `schoolSize`. The
 * world keeps one per mob and hands out the same object every time, since a school is the leader's
 * object that its followers point at. Java saves neither, so a server need not either.
 *
 * @javaSee AbstractSchoolingFish.leader
 */
export interface SchoolMembership {
    /** The membership of the leader this mob follows, or undefined when it follows none. */
    leader: SchoolMembership | undefined;
    /** How many mobs the school this mob leads holds, itself included; 1 for a mob that leads none. */
    size: number;
}

/** One item stack lying in the world, as the pickup goals read it. */
export interface GoalItem {
    readonly id: string | number;
    position(): EntityPosition;
    /** The item identifier, such as `minecraft:wheat`. */
    identifier(): string;
    /** How many items the stack holds. */
    count(): number;
    /** Item tags, auxiliary data, and components for shareable item rules. */
    readonly filterView?: FilterItemView;
}

/** Item behavior selected from `minecraft:shareables` during pickup. */
export interface GoalPickupOptions {
    /** Whether the item may go to an empty hand or armor slot. */
    readonly canPickupToHandOrEquipment: boolean;
    /** Whether a piglin should admire the item after taking it. */
    readonly admire: boolean;
    /** Whether a piglin should barter for the item after taking it. */
    readonly barter: boolean;
    /** Whether the item should become the carried item for `eat_carried_item`. */
    readonly consumeItem: boolean;
    /** Whether an item that cannot be equipped should go in `minecraft:inventory`. */
    readonly storedInInventory: boolean;
}

/** One recipe-backed conversion prepared for an entity to share. */
export interface GoalItemCraft {
    /** The recipe that produces the shared item. */
    readonly recipeId: string;
    /** The item identifier consumed by the recipe. */
    readonly inputIdentifier: string;
    /** The number of input items this transfer consumes. */
    readonly inputCount: number;
    /** The item identifier the recipe produces. */
    readonly outputIdentifier: string;
    /** The total number of output items the recipe produces. */
    readonly craftedCount: number;
    /** The number of output items this transfer gives away. */
    readonly outputCount: number;
}

/** How a goal wants a spawned entity set up, beyond its type, position and spawn event. */
export interface GoalSpawnOptions {
    /** Whether the spawning entity owns the new one, as an evoker owns its fangs and vexes. */
    readonly owned?: boolean;
    /** Which way the new entity faces, in degrees. */
    readonly yaw?: number;
    /** Entity-specific fields, such as how long a set of evoker fangs waits before it rises. */
    readonly data?: Readonly<Record<string, unknown>>;
    /** A mob the new entity mounts once it exists, as a trap skeleton mounts its horse. */
    readonly rides?: GoalMob;
    /** Items for equipment slots, such as `head`, that the new entity's own equipment left empty. */
    readonly fillEmptySlots?: Readonly<Record<string, string>>;
    /** The velocity the new entity starts with. */
    readonly velocity?: EntityPosition;
    /**
     * Enchants what the new entity holds and wears in these slots through a Java enchantment
     * provider, such as `minecraft:mob_spawn_equipment`, once the empty slots are filled.
     */
    readonly enchantFromProvider?: { readonly provider: string; readonly slots: readonly string[] };
}

/** One block a block search found. */
export interface GoalBlock {
    readonly position: EntityPosition;
    /** The block identifier, such as `minecraft:farmland`. */
    readonly identifier: string;
}

/** A block's state values, keyed by state name, such as a berry bush's `growth`. */
export type GoalBlockStates = Readonly<Record<string, string | number | boolean>>;

/** A Java block state: Java's block name and its properties, every value spelled as Java writes it. */
export interface JavaBlockState {
    readonly name: string;
    readonly properties: Readonly<Record<string, string>>;
}

/** What a goal searches the world for, as the block-seeking goals describe it. */
export interface BlockQuery {
    /** Identifiers to match; an empty or absent list matches every block. */
    readonly identifiers?: readonly string[];
    /** How far to look horizontally, in blocks. */
    readonly range: number;
    /** How far to look vertically, in blocks. */
    readonly height: number;
    /** Maximum number of nearest matches to return; omitted returns every match. */
    readonly limit?: number;
}

/** What one entity did to this one, as the hurt and revenge goals read it. */
export interface GoalDamage {
    /** Who dealt it, or undefined when the source was not an entity. */
    readonly mob: GoalMob | undefined;
    /** The damage cause, such as `entity_attack`. */
    readonly cause: string;
    /** How much damage this source has dealt in total. */
    readonly total: number;
}

/**
 * The world seam the goals act through.
 *
 * A server supplies one of these per entity through
 * {@link VanillaGoalOptions.world}.
 */
export interface GoalWorld {
    /** The blocks around the entity, which is what the path finder reads. */
    navigation?(): NavigationView | undefined;
    /** One game rule's value, by Java's name such as `mobGriefing`, or undefined when unknown. */
    gameRule?(name: string): boolean | number | undefined;
    /** Whether Java's level considers it bright outside. */
    isBrightOutside?(): boolean;
    /**
     * Every matching entity within the radius, nearest first.
     *
     * When supplied, `families` is a candidate hint: return entities in any
     * listed family, and include every entity that could match those families.
     */
    mobs?(radius: number, families?: readonly string[]): readonly GoalMob[];
    /** Every player within the radius, nearest first. */
    players?(radius: number): readonly GoalMob[];
    /** Every item stack lying within the radius, nearest first. */
    items?(radius: number): readonly GoalItem[];
    /** Blocks matching the query, nearest first, up to its optional limit. */
    blocks?(query: BlockQuery): readonly GoalBlock[];
    /** Whether the entity has line of sight to the mob, for `must_see`. */
    canSee?(mob: GoalMob): boolean;
    /**
     * Java's `LivingEntity.hasLineOfSight`: whether no block stands between the entity's eyes and
     * the mob's, up to 128 blocks, whatever the entity's follow range.
     *
     * @javaSee LivingEntity.hasLineOfSight(Lnet/minecraft/world/entity/Entity;)Z
     */
    hasLineOfSight?(mob: GoalMob): boolean;
    /** Whether Java's combat target rules allow this mob to be selected or retained. */
    isAttackable?(mob: GoalMob): boolean;
    /** The entity's current attack target. */
    target?(): GoalMob | undefined;
    /** Sets or clears the attack target, which is what the targeting goals exist to do. */
    setTarget?(mob: GoalMob | undefined): void;
    /** Sets another mob's attack target, which is how `hurt_by_target` alerts the mob's allies. */
    setTargetOf?(mob: GoalMob, target: GoalMob): void;
    /** Who has damaged the entity, oldest first, with the running total each has dealt. */
    damagers?(): readonly GoalDamage[];
    /** Who last pushed the entity, for `minecraft:behavior.target_when_pushed`. */
    lastPusher?(): GoalMob | undefined;
    /** The entity's owner, for the tamed-pet goals. */
    owner?(): GoalMob | undefined;
    /** The entity the entity rides. */
    vehicle?(): GoalMob | undefined;
    /** Who rides the entity. */
    riders?(): readonly GoalMob[];
    /** The entity's place in a fish school, which `minecraft:flocking` reads and changes. */
    school?(): SchoolMembership | undefined;
    /** The entity's home position, from `minecraft:home` or a `set_home_position` event. */
    home?(): EntityPosition | undefined;
    /** Records a home position. */
    setHome?(position: EntityPosition | undefined): void;
    /**
     * The nearest point of interest of a type, such as `village`, `bed`,
     * `work`, `bell` or the `poi_type` a goal names.
     */
    poi?(type: string, radius: number): EntityPosition | undefined;
    /**
     * Deals the entity's melee damage to the mob, or `damage` in its place for a blow whose
     * strength the goal sets, such as a ravager's roar.
     */
    attack?(mob: GoalMob, damage?: number): void;
    /** Fires the entity's projectile at the mob. */
    shoot?(mob: GoalMob, projectile: string | undefined): void;
    /** Knocks the mob away from the entity. */
    knockback?(mob: GoalMob, horizontal: number, vertical: number): void;
    /**
     * Adds to another mob's velocity, Java's `Entity.push`, for the dragon's wings.
     *
     * @javaSee Entity.push(Lnet/minecraft/world/phys/Vec3;)V
     */
    pushMob?(mob: GoalMob, velocity: EntityPosition): void;
    /** Adds to the entity's own velocity, for the leap, charge and ram goals. */
    push?(velocity: EntityPosition): void;
    /** Moves the entity at once, for the teleport goals. */
    teleportTo?(position: EntityPosition): void;
    /** Removes the entity, for the timed end of the dragon death animation. */
    removeSelf?(): void;
    /** Puts the entity on the mob as a rider. */
    mount?(mob: GoalMob): void;
    /** Takes the entity off whatever it rides. */
    dismount?(): void;
    /** Throws every rider off the entity, which is Java's `ejectPassengers`. */
    ejectRiders?(): void;
    /** Tames the entity for a player, as a mount whose temper roll won. */
    tameBy?(player: GoalMob): void;
    /**
     * Whether the entity may pick up items at all, for a pickup goal that declares
     * `pickup_based_on_chance`: Java's `Mob.canPickUpLoot`, rolled once per mob. A host that
     * leaves it out has the goal roll a chance on each attempt instead.
     *
     * @javaSee Mob.canPickUpLoot()Z
     */
    canPickUpLoot?(): boolean;
    /** Takes up to `count` items from the stack into the entity's inventory or hand. */
    pickUp?(item: GoalItem, count?: number, options?: GoalPickupOptions): void;
    /** Drops an item at a position, or at the entity when none is given. */
    dropItem?(identifier: string, position: EntityPosition | undefined): void;
    /** Hands items to another entity, for the sharing and gift goals. */
    giveItem?(mob: GoalMob, identifier: string, count?: number): void;
    /** Whether an item type carries one of the active Bedrock item tags. */
    itemHasTag?(identifier: string, tag: string): boolean;
    /** Whether an item type declares an item component, such as `minecraft:kinetic_weapon`. */
    itemHasComponent?(identifier: string, component: string): boolean;
    /** Finds a loaded crafting recipe that converts one item into another. */
    craftInto?(
        inputIdentifier: string,
        outputIdentifier: string,
        availableInput: number,
        wantedOutput: number
    ): GoalItemCraft | undefined;
    /** Consumes a prepared recipe's inputs and gives its output to another entity. */
    giveCraftedItem?(mob: GoalMob, craft: GoalItemCraft): void;
    /** What the entity holds in its main hand. */
    carriedItem?(): string | undefined;
    /** How many items of one identifier it keeps across inventory and equipment. */
    itemCount?(identifier: string): number;
    /** Puts an item in the entity's main hand, or empties it. */
    setCarriedItem?(identifier: string | undefined): void;
    /** The entity's inventory contents, for the item and trade goals. */
    inventory?(): readonly string[];
    /** The entity's inventory slots and flat items, for `minecraft:behavior.share_items`. */
    shareInventory?(): readonly string[];
    /** Replaces a block, for the place, plant, compost and egg goals; absent states take the defaults. */
    setBlock?(position: EntityPosition, identifier: string, states?: GoalBlockStates): void;
    /** The block at a position with its states, for the goals that read a crop's growth. */
    blockAt?(position: EntityPosition): { readonly identifier: string; readonly states: GoalBlockStates } | undefined;
    /**
     * The block at a position as Java's state: its Java name, such as `minecraft:beetroots`, and
     * its properties in Java's spelling, for the goals that follow a Java block rule. Undefined
     * when no Java state maps onto the block.
     */
    javaBlockAt?(position: EntityPosition): JavaBlockState | undefined;
    /** Replaces the block at a position with the world's own block for a Java state, with block updates. */
    setJavaBlock?(position: EntityPosition, state: JavaBlockState): void;
    /** Opens or closes the door at a position, either half; anything else is left alone. */
    setDoorOpen?(position: EntityPosition, open: boolean): void;
    /**
     * Whether the entity's last move was stopped short sideways, Java's `Entity.horizontalCollision`,
     * which tells a door breaker that the door is in its way.
     *
     * @javaSee Entity.horizontalCollision
     */
    horizontalCollision?(): boolean;
    /**
     * Breaks the door at a position, both halves, dropping nothing, with Java's door crash sound
     * and break particles (`BreakDoorGoal.tick`'s `removeBlock` and level events 1021 and 2001).
     * `mobGriefing` is the goal's to check.
     */
    breakDoor?(position: EntityPosition): void;
    /**
     * Shows the cracks on a door a mob is breaking, Java's `Level.destroyBlockProgress`: `stage`
     * from 0 to 9, or -1 to take them away.
     *
     * @javaSee Level.destroyBlockProgress
     */
    doorBreakProgress?(position: EntityPosition, stage: number): void;
    /** Plays the sound of a mob beating on a wooden door, Java's level event 1019. */
    knockOnDoor?(position: EntityPosition): void;
    /** Breaks a block, for the eat, harvest and dig goals. */
    breakBlock?(position: EntityPosition): void;
    /** Whether the block at a position is in a Java block tag, such as `minecraft:dragon_immune`. */
    blockHasTag?(position: EntityPosition, tag: string): boolean;
    /**
     * Creates another entity, for the summon and lay goals.
     * @returns The new entity, or undefined when the world could not create it.
     */
    spawn?(
        identifier: string,
        position: EntityPosition,
        event: string | undefined,
        options?: GoalSpawnOptions
    ): GoalMob | undefined;
    /** The entity itself as another goal's world would see it, to hand to a mob that rides it. */
    self?(): GoalMob | undefined;
    /** Fires an entity event on another entity, as the evoker's wololo spell does on a sheep. */
    fireOn?(mob: GoalMob, event: string): void;
    /**
     * Java's `Level.getGameTime`: ticks since the world was created, which spell intervals count against.
     *
     * @javaSee LevelAccessor.getGameTime
     */
    gameTime?(): number;
    /** Removes another entity the goal made, as the dragon's flame phase takes back its breath. */
    discard?(mob: GoalMob): void;
    /**
     * Moves the entity and turns it, with no teleport and no physics of the runtime's own: the
     * ender dragon flies by Java's `aiStep`, which a `noPhysics` dragon moves itself.
     * @param yaw - Which way it faces, in degrees, in the convention every mob's yaw uses.
     */
    moveSelf?(position: EntityPosition, yaw: number, pitch: number): void;
    /**
     * The first y above the highest motion-blocking block of a column, Java's
     * `MOTION_BLOCKING_NO_LEAVES` heightmap, or undefined when the world cannot say.
     */
    surfaceY?(x: number, z: number): number | undefined;
    /** The dimension's sea level. */
    seaLevel?(): number;
    /**
     * Where the dragon fight the entity belongs to is centered, Java's `EnderDragon.getFightOrigin`.
     *
     * @javaSee EnderDragon.getFightOrigin
     */
    fightOrigin?(): EntityPosition;
    /**
     * How many end crystals still stand on the fight's pillars, Java's `getCrystalsAlive`, or
     * undefined when the entity belongs to no dragon fight.
     */
    endCrystalsAlive?(): number | undefined;
    /** Plays one of the entity's sound events. */
    playSound?(name: string): void;
    /** Opens the trade screen with a player. */
    openTrade?(player: GoalMob): void;
    /** Whether a player is trading with the entity now. */
    tradingPlayer?(): GoalMob | undefined;
    /** Sets the sitting flag, which the sit goals hold while they run. */
    setSitting?(sitting: boolean): void;
    /** Sets the sleeping flag, which the sleep and nap goals hold while they run. */
    setSleeping?(sleeping: boolean): void;
    /** Rolls a loot table at a position, for the goals that drop a table's contents. */
    dropLoot?(table: string, position: EntityPosition): void;
    /** Detonates the entity, for `minecraft:behavior.swell`. */
    explode?(): void;
    /** Fires an entity event on another entity, which `trigger` with a target does. */
    trigger?(event: string, target: string): void;
    /** Whether the entity can breed with the mob now. */
    canBreedWith?(mob: GoalMob): boolean;
    /** Whether this entity's active breeding data lets it look for a mate now. */
    isReadyToBreed?(): boolean;
    /** Produces the offspring of a successful breeding. */
    breedWith?(mob: GoalMob): void;
    /** Records what the goal met and could not carry out. */
    report?(message: string): void;
}

/** A world that answers nothing, which is what a goal gets when the server supplies none. */
export const emptyGoalWorld: GoalWorld = {};

/** Resolves the world seam for one entity. */
export type GoalWorldSource = (entity: EntityInstance) => GoalWorld | undefined;
