/**
 * The part of the world seam the entity and player members of `@minecraft/server` reach beyond
 * {@link ScriptWorld}'s own reads: an entity's active components as its definition writes them,
 * its motion and state, its properties and events, riding, leashing and taming, a player's
 * experience and spawn point, and the messages a player's client is sent for the camera, the HUD,
 * input permissions, sounds and music.
 *
 * Everything crosses as plain data, as the rest of the seam does
 * ([ADR 0011](../../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)).
 */
import type { ScriptItem, ScriptVector3 } from '../world';

/** A rotation in degrees: `x` the pitch, `y` the yaw. */
export interface ScriptRotation {
    readonly x: number;
    readonly y: number;
}

/** An entity's motion and the states a script reads of it, read in one call. */
export interface ScriptEntityStatus {
    /** Its velocity, in blocks per tick. */
    readonly velocity: ScriptVector3;
    readonly onGround: boolean;
    readonly inWater: boolean;
    /** Whether it is on a ladder, a vine or another block it climbs. */
    readonly climbing: boolean;
    readonly sleeping: boolean;
    readonly sprinting: boolean;
    readonly swimming: boolean;
    /** How many ticks it burns for; 0 when it is not on fire. */
    readonly fireTicks: number;
    /** Its collision box. */
    readonly box: { readonly min: ScriptVector3; readonly max: ScriptVector3 };
    /** The entity it is attacking, by id. Absent when it attacks none. */
    readonly target?: string;
    /** The entity it rides, by id. */
    readonly vehicle?: string;
    /** The entities that ride it, by id, in the order they took their seats. */
    readonly riders: readonly string[];
    /** The entity that holds its leash, by id. */
    readonly leashHolder?: string;
    /** The player it is tamed to, by id. Absent for a wild or ownerless entity. */
    readonly owner?: string;
    /** Whether it is tamed, which a horse can be without an owner. */
    readonly tamed: boolean;
    /** A player's flight, glide, jump and emote. Absent reads as false. */
    readonly flying?: boolean;
    readonly gliding?: boolean;
    readonly jumping?: boolean;
    readonly emoting?: boolean;
}

/** An entity property's definition and its value now. */
export interface ScriptEntityProperty {
    readonly type: 'int' | 'float' | 'bool' | 'enum';
    readonly value: number | boolean | string;
    readonly defaultValue: number | boolean | string;
    /** An `int` or `float` property's bounds. */
    readonly range?: readonly [number, number];
    /** An `enum` property's values. */
    readonly values?: readonly string[];
}

/** A player's experience, as Bedrock keeps it: whole levels and how far along the next one the bar is. */
export interface ScriptExperience {
    readonly level: number;
    /** From 0 to 1. */
    readonly progress: number;
}

/** What a player's client told the server about itself. */
export interface ScriptClientInfo {
    readonly locale: string;
    readonly maxRenderDistance: number;
    readonly platformType: 'Console' | 'Desktop' | 'Mobile';
    readonly graphicsMode: 'Deferred' | 'Fancy' | 'RayTraced' | 'Simple';
    readonly inputMode: 'Gamepad' | 'KeyboardAndMouse' | 'MotionController' | 'Touch';
    readonly touchOnlyAffectsHotbar: boolean;
    /** The movement input this tick, `x` sideways and `y` forward, each from -1 to 1. */
    readonly movement: { readonly x: number; readonly y: number };
    readonly jump: boolean;
    readonly sneak: boolean;
    /** The round trip to the client, in milliseconds. Absent for a player with no client, such as a simulated one. */
    readonly ping?: number;
    /** Absent for a player with no client. */
    readonly splitScreenSlot?: 'First' | 'Second' | 'Third' | 'Fourth';
    /** An id that stays the player's across sessions. */
    readonly persistentId: string;
}

/** A point in a dimension. */
export interface ScriptDimensionLocation extends ScriptVector3 {
    readonly dimension: string;
}

/** A player's permission levels, by their numbers in `CommandPermissionLevel` and `PlayerPermissionLevel`. */
export interface ScriptPermissionLevels {
    readonly command: number;
    readonly player: number;
}

/** A camera instruction a script sends a player, as `Camera`'s members describe it. */
export type ScriptCameraInstruction =
    | {
          readonly kind: 'set';
          /** The preset's id, such as `minecraft:free`. */
          readonly preset: string;
          readonly location?: ScriptVector3;
          readonly rotation?: ScriptRotation;
          readonly facing?: ScriptVector3;
          readonly facingEntity?: string;
          readonly ease?: { readonly time: number; readonly type: string };
          /** Whether the preset becomes the player's default camera. */
          readonly isDefault?: boolean;
      }
    | { readonly kind: 'clear' }
    | {
          readonly kind: 'fade';
          readonly time?: { readonly fadeIn: number; readonly hold: number; readonly fadeOut: number };
          readonly color?: { readonly red: number; readonly green: number; readonly blue: number };
      }
    | { readonly kind: 'fov'; readonly fov: number; readonly ease?: { readonly time: number; readonly type: string } }
    | { readonly kind: 'attach'; readonly entity?: string }
    | { readonly kind: 'detach' };

/** What a script sends a player's client. */
export type ScriptClientMessage =
    | { readonly kind: 'camera'; readonly instruction: ScriptCameraInstruction }
    | {
          readonly kind: 'shake';
          readonly intensity: number;
          readonly seconds: number;
          readonly type: 'positional' | 'rotational';
      }
    | { readonly kind: 'stopShake' }
    /** The HUD elements a script hid, by their numbers in `HudElement`, all of them sent each time. */
    | { readonly kind: 'hud'; readonly hidden: readonly number[]; readonly visible: readonly number[] }
    /** The input a script locked, as `InputPermissionCategory` numbers. */
    | { readonly kind: 'inputLocks'; readonly locked: readonly number[] }
    | { readonly kind: 'cooldown'; readonly category: string; readonly ticks: number }
    | { readonly kind: 'controlScheme'; readonly scheme: string }
    | { readonly kind: 'stopSound'; readonly sound?: string }
    | {
          readonly kind: 'music';
          readonly action: 'play' | 'queue' | 'stop';
          readonly track?: string;
          readonly volume?: number;
          readonly fade?: number;
          readonly loop?: boolean;
      }
    | {
          readonly kind: 'aimAssist';
          /** Absent turns aim assist off. */
          readonly preset?: string;
          readonly targetMode: 'Angle' | 'Distance';
          readonly viewAngle: { readonly x: number; readonly y: number };
          readonly distance: number;
      }
    | {
          readonly kind: 'propertyOverride';
          readonly entity: string;
          readonly property: string;
          readonly value?: number | boolean | string;
      };

/** One aim assist category: the priorities a player's aim assist gives what it targets. */
export interface ScriptAimAssistCategory {
    readonly identifier: string;
    readonly defaultBlockPriority: number;
    readonly defaultEntityPriority: number;
    readonly blocks: Readonly<Record<string, number>>;
    readonly entities: Readonly<Record<string, number>>;
    readonly blockTags: Readonly<Record<string, number>>;
    readonly entityTypeFamilies: Readonly<Record<string, number>>;
}

/** One aim assist preset: what a player's aim assist ignores, and the category each held item uses. */
export interface ScriptAimAssistPreset {
    readonly identifier: string;
    readonly defaultItemSettings?: string;
    readonly handSettings?: string;
    readonly excludedBlocks: readonly string[];
    readonly excludedEntities: readonly string[];
    readonly excludedBlockTags: readonly string[];
    readonly excludedEntityTypeFamilies: readonly string[];
    readonly itemSettings: Readonly<Record<string, string>>;
    readonly liquidTargetingItems: readonly string[];
}

/** The aim assist registry, in the order its entries were added. */
export interface ScriptAimAssistRegistry {
    readonly categories: readonly ScriptAimAssistCategory[];
    readonly presets: readonly ScriptAimAssistPreset[];
}

/** The entity and player systems a script reaches. A world without them has none of these members' behavior. */
export interface ScriptEntitySystems {
    /**
     * The components active on an entity now, by id, each with its JSON as its definition writes
     * it: the base components, then each active component group's, later ones replacing earlier.
     * @returns Undefined for an entity that is gone.
     */
    components(id: string): ReadonlyMap<string, unknown> | undefined;
    /**
     * The `format_version` of the file that defines an entity's type, such as `1.26.50`. BDS reads
     * an item name without a namespace as written from a file of 1.26.60 or later, and with
     * `minecraft:` from an older one.
     */
    formatVersion(id: string): string | undefined;
    /** The entity's motion and state, or undefined for one that is gone. */
    status(id: string): ScriptEntityStatus | undefined;
    /**
     * Runs one of an entity's definition events.
     * @returns False when its definition has no such event.
     */
    triggerEvent(id: string, event: string): boolean;
    /** An entity's properties, by id, or undefined for one that is gone. */
    properties(id: string): ReadonlyMap<string, ScriptEntityProperty> | undefined;
    /** Writes a property's value, which the caller checked against its definition. */
    setProperty(id: string, name: string, value: number | boolean | string): void;
    /** Adds to an entity's velocity. */
    applyImpulse(id: string, impulse: ScriptVector3): void;
    clearVelocity(id: string): void;
    /** Pushes an entity along a horizontal vector, whose length is the strength, and up by `vertical`. */
    applyKnockback(id: string, horizontal: { readonly x: number; readonly z: number }, vertical: number): void;
    setRotation(id: string, rotation: ScriptRotation): void;
    /**
     * Sets an entity on fire for a number of ticks.
     * @returns False for an entity that cannot burn.
     */
    setOnFire(id: string, ticks: number): boolean;
    /** Puts an entity's fire out, and returns whether it had any. */
    extinguishFire(id: string): boolean;
    /**
     * Seats a rider on a vehicle.
     * @returns False when the vehicle has no room or does not take the rider's family.
     */
    ride(rider: string, vehicle: string): boolean;
    /** Takes a rider off whatever it rides. */
    dismount(rider: string): void;
    /** Ties an entity's leash to a holder, or unties it with none. */
    leash(id: string, holder: string | undefined): void;
    /**
     * Tames an entity, to a player when one is given.
     * @returns False for an entity that cannot be tamed or already is.
     */
    tame(id: string, player: string | undefined): boolean;
    /** Writes a script-set field of a component, such as a sheep's `color`, an NPC's `name` or a projectile's `gravity`. */
    setComponentField(id: string, component: string, field: string, value: unknown): void;
    /** The item type an item name in an entity's definition names, with a legacy name such as `minecraft:fish` read as its type now. */
    itemIdentifier(name: string): string;
    /** Every entity type the world can spawn, by id. */
    entityTypes(): readonly string[];
    /** A player's experience, or undefined for one that is gone. */
    experience(id: string): ScriptExperience | undefined;
    setExperience(id: string, experience: ScriptExperience): void;
    /** Where a player respawns; undefined for the world's spawn. */
    spawnPoint(id: string): ScriptDimensionLocation | undefined;
    setSpawnPoint(id: string, point: ScriptDimensionLocation | undefined): void;
    permissions(id: string): ScriptPermissionLevels | undefined;
    setCommandPermissionLevel(id: string, level: number): void;
    /** Sends a player's client a message. */
    sendClient(id: string, message: ScriptClientMessage): void;
    /** What a player's client told the server about itself, or undefined for a player who is gone. */
    clientInfo(id: string): ScriptClientInfo | undefined;
    /** Plays an animation on an entity for the clients that see it. */
    playAnimation(
        id: string,
        animation: {
            readonly name: string;
            readonly nextState?: string;
            readonly blendOutTime?: number;
            readonly stopExpression?: string;
            readonly controller?: string;
        }
    ): void;
    /** Applies a food's effect on a player, as eating it does. */
    eat(id: string, typeId: string): void;
    /** The vanilla aim assist registry the world's clients are sent when they join. */
    aimAssist(): ScriptAimAssistRegistry;
    /** Adds categories and presets a script registered, for the clients now in the world and those who join later. */
    addAimAssist(added: ScriptAimAssistRegistry): void;
    /** A player's ender chest, or undefined for one that is gone. */
    enderChest(id: string): readonly (ScriptItem | null)[] | undefined;
    setEnderChestItem(id: string, slot: number, item: ScriptItem | undefined): void;
}
