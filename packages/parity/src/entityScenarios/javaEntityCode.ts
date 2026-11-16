import type { JavaClass, JavaMethod, JavaOperation } from '../javaClassFile.ts';
import { javaOperations, pinnedJavaClass, pinnedJavaClassFile, pinnedJavaClassNames } from '../javaClassFile.ts';

/**
 * Readers for the Java rules the entity scenarios compare against, taken from the pinned server
 * jar's entity classes rather than written down by hand: which builder flags `EntityTypes`
 * registers a type with, which class a type runs, and the constants its methods push.
 */

const ENTITY_PACKAGE = 'net/minecraft/world/entity/';

/**
 * Java entity types whose class name is not the type's name in Pascal case, by Java id. The rest
 * are found by name.
 */
const CLASS_NAME_EXCEPTIONS: Readonly<Record<string, string>> = {
    'minecraft:mooshroom': 'MushroomCow',
    'minecraft:wither': 'WitherBoss',
    'minecraft:tnt': 'PrimedTnt',
    'minecraft:fireball': 'LargeFireball',
    'minecraft:tnt_minecart': 'MinecartTNT',
    'minecraft:fishing_bobber': 'FishingHook',
    'minecraft:experience_bottle': 'ThrownExperienceBottle',
    'minecraft:trident': 'ThrownTrident',
    'minecraft:egg': 'ThrownEgg',
    'minecraft:ender_pearl': 'ThrownEnderpearl',
    'minecraft:splash_potion': 'ThrownSplashPotion',
    'minecraft:lingering_potion': 'ThrownLingeringPotion',
    'minecraft:snow_golem': 'SnowGolem',
    'minecraft:evoker': 'Evoker',
    'minecraft:end_crystal': 'EndCrystal',
    'minecraft:wind_charge': 'WindCharge',
    'minecraft:breeze_wind_charge': 'BreezeWindCharge'
};

const pascalCase = (javaId: string): string =>
    javaId
        .replace(/^minecraft:/, '')
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');

let classesBySimpleName: ReadonlyMap<string, string> | undefined;

/** Every entity class in the jar by its simple name; a name two packages share is left out. */
const entityClasses = (): ReadonlyMap<string, string> => {
    if (classesBySimpleName !== undefined) return classesBySimpleName;
    const found = new Map<string, string>();
    const shared = new Set<string>();
    for (const name of pinnedJavaClassNames(ENTITY_PACKAGE)) {
        const simple = name.slice(name.lastIndexOf('/') + 1);
        if (simple.includes('$')) continue;
        if (found.has(simple)) shared.add(simple);
        found.set(simple, name);
    }
    for (const simple of shared) found.delete(simple);
    classesBySimpleName = found;
    return found;
};

/**
 * The binary name of the class a Java entity type runs, such as
 * `net/minecraft/world/entity/monster/Blaze` for `minecraft:blaze`.
 * @throws {Error} When the jar holds no such class.
 */
export const javaEntityClassName = (javaId: string): string => {
    const simple = CLASS_NAME_EXCEPTIONS[javaId] ?? pascalCase(javaId);
    const name = entityClasses().get(simple);
    if (name === undefined) throw new Error(`the server jar holds no entity class ${simple} for ${javaId}`);
    return name;
};

const chains = new Map<string, readonly JavaClass[]>();

/** A class and its superclasses that the jar holds, nearest first. */
export const javaClassChain = (className: string): readonly JavaClass[] => {
    const cached = chains.get(className);
    if (cached !== undefined) return cached;
    const chain: JavaClass[] = [];
    let next: string | undefined = className;
    while (next?.startsWith('net/minecraft/') === true) {
        const parsed = pinnedJavaClassFile(next);
        if (parsed === undefined) break;
        chain.push(parsed);
        next = parsed.superName;
    }
    chains.set(className, chain);
    return chain;
};

/** The simple names of a class and its superclasses, nearest first. */
export const javaAncestry = (className: string): readonly string[] =>
    javaClassChain(className).map((entry) => entry.name.slice(entry.name.lastIndexOf('/') + 1));

/**
 * The nearest declaration of a method in a class or its superclasses, with the simple name of the
 * class that declares it, which is the method Java runs for that class.
 */
export const javaMethodOf = (
    className: string,
    method: string
): { readonly owner: string; readonly method: JavaMethod } | undefined => {
    for (const entry of javaClassChain(className)) {
        const found = entry.methods.find((candidate) => candidate.name === method);
        if (found !== undefined) return { owner: entry.name.slice(entry.name.lastIndexOf('/') + 1), method: found };
    }
    return undefined;
};

/** The numbers a method pushes, in the order its code pushes them. */
export const pushedNumbers = (method: JavaMethod): readonly number[] =>
    javaOperations(method).flatMap((instruction) => (instruction.kind === 'number' ? [instruction.value] : []));

/**
 * The number a method pushes nearest before or after a call it makes, such as the `4` of
 * `hurtServer(level, damageSources().lava(), 4.0F)`, which comes before the `hurtServer` call.
 * @param method - The method's code.
 * @param call - The call's `Owner.name` suffix, such as `.hurtServer` or `DamageSources.drown`.
 * @param side - Whether the number is pushed before the call or after it.
 */
export const numberNear = (method: JavaMethod, call: string, side: 'before' | 'after'): number | undefined => {
    const index = javaOperations(method).findIndex(
        (instruction) => instruction.kind === 'call' && instruction.target.endsWith(call)
    );
    if (index < 0) return undefined;
    const range: readonly JavaOperation[] =
        side === 'before' ? javaOperations(method).slice(0, index).reverse() : javaOperations(method).slice(index + 1);
    const found = range.find((instruction) => instruction.kind === 'number');
    return found?.kind === 'number' ? found.value : undefined;
};

/** What one `EntityTypes` registration chains onto its `EntityType.Builder`. */
export interface JavaEntityTypeBuilder {
    /** The builder methods the registration calls, such as `fireImmune` or `immuneTo`. */
    readonly calls: readonly string[];
    /** The `BlockTags` fields the registration reads, which `immuneTo` takes. */
    readonly blockTags: readonly string[];
}

let builders: ReadonlyMap<string, JavaEntityTypeBuilder> | undefined;

/**
 * The builder chain of every Java entity type, by Java id, read from the static initializer of
 * `EntityTypes`: each registration reads its id from `EntityTypeIds`, chains the builder and
 * writes its `EntityTypes` field.
 */
export const javaEntityTypeBuilders = (): ReadonlyMap<string, JavaEntityTypeBuilder> => {
    if (builders !== undefined) return builders;
    const initializer = pinnedJavaClass(`${ENTITY_PACKAGE}EntityTypes`).find((method) => method.name === '<clinit>');
    const found = new Map<string, JavaEntityTypeBuilder>();
    let current: { id: string; calls: string[]; blockTags: string[] } | undefined;
    for (const instruction of initializer === undefined ? [] : javaOperations(initializer)) {
        if (instruction.kind === 'field' && !instruction.write && instruction.target.startsWith('EntityTypeIds.')) {
            current = {
                id: `minecraft:${instruction.target.slice('EntityTypeIds.'.length).toLowerCase()}`,
                calls: [],
                blockTags: []
            };
        } else if (current === undefined) continue;
        else if (instruction.kind === 'call' && instruction.target.startsWith('EntityType$Builder.'))
            current.calls.push(instruction.target.slice('EntityType$Builder.'.length));
        else if (instruction.kind === 'field' && instruction.target.startsWith('BlockTags.'))
            current.blockTags.push(`minecraft:${instruction.target.slice('BlockTags.'.length).toLowerCase()}`);
        else if (instruction.kind === 'field' && instruction.write && instruction.target.startsWith('EntityTypes.')) {
            found.set(current.id, { calls: current.calls, blockTags: current.blockTags });
            current = undefined;
        }
    }
    if (found.size === 0) throw new Error('found no entity type registrations in EntityTypes.<clinit>');
    builders = found;
    return found;
};

/** Whether Java registers an entity type with `EntityType.Builder.fireImmune`, which `Entity.fireImmune` reads. */
export const javaFireImmune = (javaId: string): boolean =>
    javaEntityTypeBuilders().get(javaId)?.calls.includes('fireImmune') === true;

/** `minecraft:` and the lower-cased Java field name, as Java's registries spell `MobEffects.POISON`. */
const fieldIdentifier = (field: string): string => `minecraft:${field.slice(field.indexOf('.') + 1).toLowerCase()}`;

/**
 * The status effects Java's `canBeAffected` refuses a type, read from the class and its
 * superclasses: an override such as `Spider.canBeAffected` refuses every effect it names, and
 * `LivingEntity.canBeAffected` refuses the effects it names after each entity type tag the type
 * is in, such as `ignores_poison_and_regen`.
 * @param javaId - The Java entity type.
 * @param inTag - Whether the type is in a Java entity type tag.
 */
export const javaEffectImmunities = (javaId: string, inTag: (tag: string) => boolean): ReadonlySet<string> => {
    const immune = new Set<string>();
    for (const entry of javaClassChain(javaEntityClassName(javaId))) {
        const method = entry.methods.find((candidate) => candidate.name === 'canBeAffected');
        if (method === undefined) continue;
        const living = entry.name.endsWith('/LivingEntity');
        let tag: string | undefined;
        for (const instruction of javaOperations(method)) {
            if (instruction.kind !== 'field' || instruction.write) continue;
            if (instruction.target.startsWith('EntityTypeTags.')) tag = fieldIdentifier(instruction.target);
            else if (instruction.target.startsWith('MobEffects.') && (!living || (tag !== undefined && inTag(tag))))
                immune.add(fieldIdentifier(instruction.target));
        }
    }
    return immune;
};

/** Every status effect a `canBeAffected` in the entity classes names, which is what an immunity row probes. */
export const javaEffectsNamedByCanBeAffected = (javaIds: readonly string[]): readonly string[] => {
    const names = new Set<string>();
    for (const javaId of javaIds)
        for (const entry of javaClassChain(javaEntityClassName(javaId)))
            for (const instruction of javaOperations(
                entry.methods.find((method) => method.name === 'canBeAffected') ?? { instructions: [] }
            ))
                if (instruction.kind === 'field' && instruction.target.startsWith('MobEffects.'))
                    names.add(fieldIdentifier(instruction.target));
    return [...names].sort();
};

/**
 * The number a method pushes right before it writes a field, such as `30` before `Creeper.maxSwell`:
 * at the first write, or at the last when a method writes the field twice, as `Vex.tick` counts its
 * life down and then sets it back to 20.
 */
export const numberBeforeWrite = (
    method: JavaMethod,
    field: string,
    occurrence: 'first' | 'last' = 'first'
): number | undefined => {
    const writes = (instruction: JavaOperation): boolean =>
        instruction.kind === 'field' && instruction.write && instruction.target === field;
    const index =
        occurrence === 'first'
            ? javaOperations(method).findIndex(writes)
            : javaOperations(method).findLastIndex(writes);
    const before = index < 0 ? undefined : javaOperations(method)[index - 1];
    return before?.kind === 'number' ? before.value : undefined;
};
