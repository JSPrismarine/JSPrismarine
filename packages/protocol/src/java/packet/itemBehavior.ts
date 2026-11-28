/**
 * The data components that give an item behavior the client predicts: eating it, mining with it
 * and wearing it. Each one names registry entries, such as sounds, blocks and status effects, by
 * their network ids in the release's static registries.
 */
import type BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import type { WireType } from '../../wire/fieldTypes';
import { bool, custom, list, optional } from '../../wire/fieldTypes';
import type { JavaRegistry } from '../versions/javaRegistry';
import { BLOCKS, CONSUME_EFFECT_TYPES, ENTITY_TYPES, MOB_EFFECTS, SOUND_EVENTS } from '../versions/newest';
import { float, javaString, varInt } from '../wire/javaTypes';

/** `Identifier`: a namespaced id as a string. */
const identifier = javaString(32_767);

/** An entry's network id, or a throw naming the registry that lacks it. */
const idIn = (registry: JavaRegistry, name: string, entry: string): number => {
    const id = registry.idOf(entry);
    if (id === undefined) throw new ProtocolWireErrors.JavaRegistryEntryUnknown({ registry: name, entry });
    return id;
};

/** The entry a network id names, or a throw for an id past the registry's end. */
const entryIn = (registry: JavaRegistry, name: string, id: number): string => {
    const entry = registry.nameOf(id);
    if (entry === undefined) throw new ProtocolWireErrors.JavaRegistryEntryUnknown({ registry: name, entry: `#${id}` });
    return entry;
};

/** A registry entry by its network id. */
const registryEntry = (registry: JavaRegistry, name: string): WireType<string> =>
    custom<string>(
        name,
        (s, entry) => varInt.write(s, idIn(registry, name, entry)),
        (s) => entryIn(registry, name, varInt.read(s))
    );

/** A set of registry entries: a tag, as `{ tag }` without its `#`, or the entries themselves. */
export type JavaHolderSet = { readonly tag: string } | readonly string[];

/**
 * `HolderSet`: zero and then a tag's id, or the entry count plus one and then each entry's id.
 * @javaSource ByteBufCodecs.holderSet
 */
const holderSet = (registry: JavaRegistry, name: string): WireType<JavaHolderSet> =>
    custom<JavaHolderSet>(
        `HolderSet<${name}>`,
        (s, set) => {
            if ('tag' in set) {
                varInt.write(s, 0);
                identifier.write(s, set.tag);
                return;
            }
            varInt.write(s, set.length + 1);
            for (const entry of set) varInt.write(s, idIn(registry, name, entry));
        },
        (s) => {
            const size = varInt.read(s);
            if (size === 0) return { tag: identifier.read(s) };
            const entries: string[] = [];
            for (let i = 1; i < size; i++) entries.push(entryIn(registry, name, varInt.read(s)));
            return entries;
        }
    );

/** A sound event: one the release registers, or any id with how far it carries. */
export interface JavaSoundEvent {
    readonly id: string;
    /** How far it carries, in blocks; by its volume when absent. */
    readonly range?: number;
}

const optionalFloat = optional(float);

/**
 * `Holder<SoundEvent>`: a registered sound's id plus one, or zero and then the sound itself, its
 * id and its optional range. A sound with a range, or one the release lacks, goes inline.
 * @javaSource SoundEvent.STREAM_CODEC
 */
const soundEvent = custom<JavaSoundEvent>(
    'Sound Event',
    (s, { id, range }) => {
        const registered = range === undefined ? SOUND_EVENTS.idOf(id) : undefined;
        if (registered !== undefined) {
            varInt.write(s, registered + 1);
            return;
        }
        varInt.write(s, 0);
        identifier.write(s, id);
        optionalFloat.write(s, range ?? null);
    },
    (s) => {
        const holder = varInt.read(s);
        if (holder > 0) return { id: entryIn(SOUND_EVENTS, 'minecraft:sound_event', holder - 1) };
        const id = identifier.read(s);
        const range = optionalFloat.read(s);
        return range === null ? { id } : { id, range };
    }
);

/** An enum Java writes as its id, by the names in id order. */
const enumOf = <T extends string>(wire: string, names: readonly T[]): WireType<T> =>
    custom<T>(
        wire,
        (s, name) => varInt.write(s, names.indexOf(name)),
        (s) => {
            const id = varInt.read(s);
            const name = names[id];
            if (name === undefined)
                throw new ProtocolWireErrors.JavaRegistryEntryUnknown({ registry: wire, entry: `#${id}` });
            return name;
        }
    );

/**
 * How the player holds the item while using it, by `ItemUseAnimation`'s ids.
 * @javaSource ItemUseAnimation.STREAM_CODEC
 */
export const JAVA_USE_ANIMATIONS = [
    'none',
    'eat',
    'drink',
    'block',
    'bow',
    'trident',
    'crossbow',
    'spyglass',
    'toot_horn',
    'brush',
    'bundle',
    'spear'
] as const;

/** One of {@link JAVA_USE_ANIMATIONS}. */
export type JavaUseAnimation = (typeof JAVA_USE_ANIMATIONS)[number];

/**
 * The slots an item can be worn in, by `EquipmentSlot`'s ids, which are not its declaration order.
 * @javaSource EquipmentSlot.STREAM_CODEC
 */
export const JAVA_EQUIPPABLE_SLOTS = [
    'mainhand',
    'feet',
    'legs',
    'chest',
    'head',
    'offhand',
    'body',
    'saddle'
] as const;

/** One of {@link JAVA_EQUIPPABLE_SLOTS}. */
export type JavaEquippableSlot = (typeof JAVA_EQUIPPABLE_SLOTS)[number];

/** A status effect a consumable applies: its effect, level and length, and what it shows. */
export interface JavaEffectInstance {
    readonly effect: string;
    readonly details: JavaEffectDetails;
}

/** An effect instance's level, length and display, with the weaker effect it hides, if any. */
export interface JavaEffectDetails {
    readonly amplifier: number;
    /** In ticks; -1 for an infinite effect. */
    readonly duration: number;
    readonly ambient: boolean;
    readonly showParticles: boolean;
    readonly showIcon: boolean;
    /** The effect this one hides, which comes back when this one ends. */
    readonly hidden?: JavaEffectDetails;
}

/**
 * `MobEffectInstance.Details`: the amplifier and duration, three flags, then the hidden effect's
 * details, if any, in the same shape.
 * @javaSource MobEffectInstance$Details.STREAM_CODEC
 */
const effectDetails: WireType<JavaEffectDetails> = custom<JavaEffectDetails>(
    'Effect Details',
    (s, details) => writeDetails(s, details),
    (s) => readDetails(s)
);

const writeDetails = (
    s: BinaryStream,
    { amplifier, duration, ambient, showParticles, showIcon, hidden }: JavaEffectDetails
): void => {
    varInt.write(s, amplifier);
    varInt.write(s, duration);
    bool.write(s, ambient);
    bool.write(s, showParticles);
    bool.write(s, showIcon);
    bool.write(s, hidden !== undefined);
    if (hidden !== undefined) writeDetails(s, hidden);
};

const readDetails = (s: BinaryStream): JavaEffectDetails => {
    const amplifier = varInt.read(s);
    const duration = varInt.read(s);
    const ambient = bool.read(s);
    const showParticles = bool.read(s);
    const showIcon = bool.read(s);
    const base = { amplifier, duration, ambient, showParticles, showIcon };
    return bool.read(s) ? { ...base, hidden: readDetails(s) } : base;
};

const mobEffect = registryEntry(MOB_EFFECTS, 'minecraft:mob_effect');

/**
 * `MobEffectInstance`: the effect's id, then its details.
 * @javaSource MobEffectInstance.STREAM_CODEC
 */
const effectInstance = custom<JavaEffectInstance>(
    'Mob Effect Instance',
    (s, { effect, details }) => {
        mobEffect.write(s, effect);
        effectDetails.write(s, details);
    },
    (s) => ({ effect: mobEffect.read(s), details: effectDetails.read(s) })
);

/** What eating or drinking the item does, besides the food it restores. */
export type JavaConsumeEffect =
    | {
          readonly type: 'minecraft:apply_effects';
          readonly effects: readonly JavaEffectInstance[];
          /** The chance the effects are applied, from 0 to 1. */
          readonly probability: number;
      }
    | { readonly type: 'minecraft:remove_effects'; readonly effects: JavaHolderSet }
    | { readonly type: 'minecraft:clear_all_effects' }
    | {
          readonly type: 'minecraft:teleport_randomly';
          readonly diameter: number;
          readonly directionalParticles: boolean;
      }
    | { readonly type: 'minecraft:play_sound'; readonly sound: JavaSoundEvent };

const effectInstances = list(effectInstance);
const mobEffectSet = holderSet(MOB_EFFECTS, 'minecraft:mob_effect');
const consumeEffectType = registryEntry(CONSUME_EFFECT_TYPES, 'minecraft:consume_effect_type');

/**
 * `ConsumeEffect`: its type's id, then the fields that type writes.
 * @javaSource ConsumeEffect.STREAM_CODEC
 */
const consumeEffect = custom<JavaConsumeEffect>(
    'Consume Effect',
    (s, effect) => {
        consumeEffectType.write(s, effect.type);
        switch (effect.type) {
            case 'minecraft:apply_effects':
                effectInstances.write(s, [...effect.effects]);
                float.write(s, effect.probability);
                return;
            case 'minecraft:remove_effects':
                mobEffectSet.write(s, effect.effects);
                return;
            case 'minecraft:clear_all_effects':
                return;
            case 'minecraft:teleport_randomly':
                float.write(s, effect.diameter);
                bool.write(s, effect.directionalParticles);
                return;
            case 'minecraft:play_sound':
                soundEvent.write(s, effect.sound);
        }
    },
    (s): JavaConsumeEffect => {
        const type = consumeEffectType.read(s);
        switch (type) {
            case 'minecraft:apply_effects':
                return { type, effects: effectInstances.read(s), probability: float.read(s) };
            case 'minecraft:remove_effects':
                return { type, effects: mobEffectSet.read(s) };
            case 'minecraft:clear_all_effects':
                return { type };
            case 'minecraft:teleport_randomly':
                return { type, diameter: float.read(s), directionalParticles: bool.read(s) };
            case 'minecraft:play_sound':
                return { type, sound: soundEvent.read(s) };
            default:
                throw new ProtocolWireErrors.JavaRegistryEntryUnknown({
                    registry: 'minecraft:consume_effect_type',
                    entry: type
                });
        }
    }
);

/**
 * `minecraft:consumable`: how long using the item takes, how the player holds it and what it does.
 */
export interface JavaConsumable {
    readonly seconds: number;
    readonly animation: JavaUseAnimation;
    readonly sound: JavaSoundEvent;
    readonly particles: boolean;
    readonly effects: readonly JavaConsumeEffect[];
}

const useAnimation = enumOf('Item Use Animation', JAVA_USE_ANIMATIONS);
const consumeEffects = list(consumeEffect);

/**
 * The `minecraft:consumable` component's codec.
 * @javaSource Consumable.STREAM_CODEC
 */
export const consumable = custom<JavaConsumable>(
    'Consumable',
    (s, value) => {
        float.write(s, value.seconds);
        useAnimation.write(s, value.animation);
        soundEvent.write(s, value.sound);
        bool.write(s, value.particles);
        consumeEffects.write(s, [...value.effects]);
    },
    (s) => ({
        seconds: float.read(s),
        animation: useAnimation.read(s),
        sound: soundEvent.read(s),
        particles: bool.read(s),
        effects: consumeEffects.read(s)
    })
);

/** One of a tool's rules: the blocks it covers, how fast it mines them, and whether they drop. */
export interface JavaToolRule {
    readonly blocks: JavaHolderSet;
    readonly speed?: number;
    readonly correctForDrops?: boolean;
}

/**
 * `minecraft:tool`: how fast the item mines each block, and what mining costs it.
 */
export interface JavaTool {
    readonly rules: readonly JavaToolRule[];
    readonly defaultMiningSpeed: number;
    readonly damagePerBlock: number;
    readonly canDestroyBlocksInCreative: boolean;
}

const blockSet = holderSet(BLOCKS, 'minecraft:block');
const optionalBool = optional(bool);

/**
 * `Tool.Rule`: the blocks, then the optional speed and the optional answer to whether they drop.
 * @javaSource Tool$Rule.STREAM_CODEC
 */
const toolRule = custom<JavaToolRule>(
    'Tool Rule',
    (s, { blocks, speed, correctForDrops }) => {
        blockSet.write(s, blocks);
        optionalFloat.write(s, speed ?? null);
        optionalBool.write(s, correctForDrops ?? null);
    },
    (s) => {
        const blocks = blockSet.read(s);
        const speed = optionalFloat.read(s);
        const correctForDrops = optionalBool.read(s);
        return {
            blocks,
            ...(speed === null ? {} : { speed }),
            ...(correctForDrops === null ? {} : { correctForDrops })
        };
    }
);

const toolRules = list(toolRule);

/**
 * The `minecraft:tool` component's codec.
 * @javaSource Tool.STREAM_CODEC
 */
export const tool = custom<JavaTool>(
    'Tool',
    (s, value) => {
        toolRules.write(s, [...value.rules]);
        float.write(s, value.defaultMiningSpeed);
        varInt.write(s, value.damagePerBlock);
        bool.write(s, value.canDestroyBlocksInCreative);
    },
    (s) => ({
        rules: toolRules.read(s),
        defaultMiningSpeed: float.read(s),
        damagePerBlock: varInt.read(s),
        canDestroyBlocksInCreative: bool.read(s)
    })
);

/**
 * `minecraft:equippable`: the slot the item is worn in, how it looks and sounds there, and what
 * may wear it.
 */
export interface JavaEquippable {
    readonly slot: JavaEquippableSlot;
    readonly equipSound: JavaSoundEvent;
    /** The `equipment/` asset drawn on the wearer. */
    readonly assetId?: string;
    /** The texture drawn over the screen while it is worn on the head, as a pumpkin's is. */
    readonly cameraOverlay?: string;
    /** The entities that may wear it; any, when absent. */
    readonly allowedEntities?: JavaHolderSet;
    readonly dispensable: boolean;
    readonly swappable: boolean;
    readonly damageOnHurt: boolean;
    readonly equipOnInteract: boolean;
    readonly canBeSheared: boolean;
    readonly shearingSound: JavaSoundEvent;
}

const equippableSlot = enumOf('Equipment Slot', JAVA_EQUIPPABLE_SLOTS);
const optionalIdentifier = optional(identifier);
const optionalEntities = optional(holderSet(ENTITY_TYPES, 'minecraft:entity_type'));

/**
 * The `minecraft:equippable` component's codec.
 * @javaSource Equippable.STREAM_CODEC
 */
export const equippable = custom<JavaEquippable>(
    'Equippable',
    (s, value) => {
        equippableSlot.write(s, value.slot);
        soundEvent.write(s, value.equipSound);
        optionalIdentifier.write(s, value.assetId ?? null);
        optionalIdentifier.write(s, value.cameraOverlay ?? null);
        optionalEntities.write(s, value.allowedEntities ?? null);
        bool.write(s, value.dispensable);
        bool.write(s, value.swappable);
        bool.write(s, value.damageOnHurt);
        bool.write(s, value.equipOnInteract);
        bool.write(s, value.canBeSheared);
        soundEvent.write(s, value.shearingSound);
    },
    (s) => {
        const slot = equippableSlot.read(s);
        const equipSound = soundEvent.read(s);
        const assetId = optionalIdentifier.read(s);
        const cameraOverlay = optionalIdentifier.read(s);
        const allowedEntities = optionalEntities.read(s);
        return {
            slot,
            equipSound,
            ...(assetId === null ? {} : { assetId }),
            ...(cameraOverlay === null ? {} : { cameraOverlay }),
            ...(allowedEntities === null ? {} : { allowedEntities }),
            dispensable: bool.read(s),
            swappable: bool.read(s),
            damageOnHurt: bool.read(s),
            equipOnInteract: bool.read(s),
            canBeSheared: bool.read(s),
            shearingSound: soundEvent.read(s)
        };
    }
);
