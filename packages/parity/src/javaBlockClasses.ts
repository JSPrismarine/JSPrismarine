import type { JavaClass } from './javaClassFile.ts';
import { OPCODES, pinnedJavaClassFile } from './javaClassFile.ts';

/**
 * Java Edition's block classes, read out of the pinned server jar: which class each block id
 * constructs, and which of `BlockBehaviour`'s hooks that class overrides.
 *
 * A block's behavior lives in the hooks its class overrides. A crafting table overrides
 * `useWithoutItem`, a torch `canSurvive`, a pressure plate `entityInside` and `getSignal`. Reading
 * the overrides from the class file gives every block the rows its Java behavior needs, whether or
 * not the server has a family for it yet, and a new hook in a Java release adds the row.
 */

const BLOCK_PACKAGE = 'net/minecraft/world/level/block/';
const BLOCKS = `${BLOCK_PACKAGE}Blocks`;
/** The plain block every other block class extends; the hooks it declares are the defaults. */
const BASE_BLOCK = `${BLOCK_PACKAGE}Block`;

/** The class a `Blocks.register*` helper builds when the registration passes no factory. */
const HELPER_CLASSES: Readonly<Record<string, string>> = {
    register: BASE_BLOCK,
    registerStair: `${BLOCK_PACKAGE}StairBlock`,
    registerLegacyStair: `${BLOCK_PACKAGE}StairBlock`,
    registerSlab: `${BLOCK_PACKAGE}SlabBlock`,
    registerWall: `${BLOCK_PACKAGE}WallBlock`
};

const required = (className: string): JavaClass => {
    const parsed = pinnedJavaClassFile(className);
    if (parsed === undefined) throw new Error(`the server jar holds no ${className}.class`);
    return parsed;
};

const splitMember = (member: string): { readonly owner: string; readonly name: string } => {
    const dot = member.lastIndexOf('.');
    return { owner: member.slice(0, dot), name: member.slice(dot + 1) };
};

/** The class a factory method handle or lambda creates, following lambdas a few levels deep. */
const createdClass = (member: string, depth = 0): string | undefined => {
    if (depth > 4) return undefined;
    const { owner, name } = splitMember(member);
    if (name === '<init>') return owner;
    const method = pinnedJavaClassFile(owner)?.methods.find((candidate) => candidate.name === name);
    for (const instruction of method?.instructions ?? []) {
        if (instruction.opcode === OPCODES.NEW && instruction.type !== undefined) return instruction.type;
        for (const handle of instruction.handles ?? []) {
            const created = createdClass(handle, depth + 1);
            if (created !== undefined) return created;
        }
    }
    return undefined;
};

/** The sixteen dye colors, longest first so `light_gray_` is stripped before `gray_` could be. */
const DYE_PREFIXES = [
    'light_blue_',
    'light_gray_',
    'magenta_',
    'orange_',
    'yellow_',
    'purple_',
    'white_',
    'black_',
    'brown_',
    'green_',
    'gray_',
    'lime_',
    'pink_',
    'cyan_',
    'blue_',
    'red_'
] as const;

/** The oxidation and wax prefixes a `WeatheringCopperCollection` puts on its base block. */
const COPPER_PREFIXES = ['waxed_', 'exposed_', 'weathered_', 'oxidized_'] as const;

const stripPrefixes = (name: string, prefixes: readonly string[]): string => {
    let bare = name;
    for (let stripped = true; stripped;) {
        stripped = false;
        for (const prefix of prefixes) {
            if (bare.startsWith(prefix)) {
                bare = bare.slice(prefix.length);
                stripped = true;
            }
        }
    }
    return bare;
};

let registered: ReadonlyMap<string, string> | undefined;

/**
 * Every `Blocks` field the static initializer stores a block or a block collection in, by the
 * field's name in lower case, and the class its registration constructs.
 *
 * `Blocks.<clinit>` registers each block as a key, an optional factory handle, a
 * `Blocks.register*` call and a `putstatic`. A colored or weathering family is one
 * `ColorCollection` or `WeatheringCopperCollection` field built the same way, whose members
 * {@link javaBlockClassOf} finds by their base name.
 */
const registeredClasses = (): ReadonlyMap<string, string> => {
    if (registered !== undefined) return registered;
    const init = required(BLOCKS).methods.find((method) => method.name === '<clinit>');
    const classes = new Map<string, string>();
    let created: string | undefined;
    let helper: string | undefined;
    for (const instruction of init?.instructions ?? []) {
        const member = instruction.member === undefined ? undefined : splitMember(instruction.member);
        for (const handle of instruction.handles ?? []) {
            // The collections pass `Blocks.register` itself as a handle, which builds nothing.
            if (!handle.startsWith(`${BLOCKS}.register`)) created ??= createdClass(handle);
        }
        if (instruction.opcode === OPCODES.INVOKESTATIC && member?.owner === BLOCKS && member.name in HELPER_CLASSES) {
            helper = member.name;
        }
        if (
            instruction.opcode === OPCODES.PUTSTATIC &&
            member?.owner === BLOCKS &&
            instruction.descriptor?.startsWith(`L${BLOCK_PACKAGE}`) === true
        ) {
            const className = created ?? HELPER_CLASSES[helper ?? 'register'] ?? BASE_BLOCK;
            classes.set(member.name.toLowerCase(), className);
            created = undefined;
            helper = undefined;
        }
    }
    registered = classes;
    return classes;
};

/**
 * The binary name of the class a Java block runs, such as
 * `net/minecraft/world/level/block/CraftingTableBlock` for `minecraft:crafting_table`, or
 * undefined when the registrations name no class for it.
 *
 * A block of a colored or weathering family is found by its base name: `minecraft:red_wool` by
 * the `WOOL` collection, `minecraft:waxed_exposed_cut_copper` by `CUT_COPPER`.
 */
export const javaBlockClassOf = (javaId: string): string | undefined => {
    const classes = registeredClasses();
    const name = javaId.replace(/^minecraft:/, '');
    const direct = classes.get(name);
    if (direct !== undefined) return direct;
    const colorBase = stripPrefixes(name, DYE_PREFIXES);
    const copperBase = stripPrefixes(name, COPPER_PREFIXES);
    // A potted plant Java registers in a loop over the plants, rather than as a field of its own,
    // is still a flower pot.
    const pot = name.startsWith('potted_') ? 'flower_pot' : name;
    for (const base of [colorBase, `dyed_${colorBase}`, copperBase, `${copperBase}_block`, pot]) {
        const found = classes.get(base);
        if (found !== undefined && base !== name) return found;
    }
    return undefined;
};

const chains = new Map<string, readonly JavaClass[]>();

/** A block class and its superclasses below the plain `Block`, nearest first. */
const ownChain = (className: string): readonly JavaClass[] => {
    const cached = chains.get(className);
    if (cached !== undefined) return cached;
    const chain: JavaClass[] = [];
    for (let next: string | undefined = className; next !== undefined && next !== BASE_BLOCK;) {
        const parsed = pinnedJavaClassFile(next);
        if (parsed === undefined) break;
        chain.push(parsed);
        next = parsed.superName;
    }
    chains.set(className, chain);
    return chain;
};

/** Every interface a block class or one of its superclasses implements, with their parents. */
const interfacesOf = (className: string): ReadonlySet<string> => {
    const found = new Set<string>();
    const visit = (name: string): void => {
        if (found.has(name)) return;
        found.add(name);
        for (const parent of pinnedJavaClassFile(name)?.interfaces ?? []) visit(parent);
    };
    for (let next: string | undefined = className; next?.startsWith('net/minecraft/') === true;) {
        const parsed = pinnedJavaClassFile(next);
        if (parsed === undefined) break;
        for (const parent of parsed.interfaces) visit(parent);
        next = parsed.superName;
    }
    return found;
};

/** One kind of Java block behavior, and the `BlockBehaviour` hooks or interfaces that give a block it. */
export interface JavaBlockBehaviorKind {
    /** The aspect id the tracker files the behavior under. */
    readonly aspect: string;
    /** What comparing the behavior with Java means, for the tracker row. */
    readonly description: string;
    /** The hooks a block class overrides to have this behavior. */
    readonly hooks?: readonly string[];
    /** The interfaces a block class implements to have this behavior, by binary name. */
    readonly interfaces?: readonly string[];
}

/**
 * The behavior kinds a Java block class can add to the plain block, by the hooks of
 * `BlockBehaviour` and `Block` that carry them and the interfaces that mark them.
 *
 * Hooks that only shape rendering or the client's view (`skipRendering`, `animateTick`,
 * `getShadeBrightness`, `getVisualShape`) carry no server behavior and are not listed, and
 * `randomTick` is left to the property dump's `randomTick` flag, which the `random-tick` aspect
 * already reads.
 */
export const JAVA_BLOCK_BEHAVIOR_KINDS: readonly JavaBlockBehaviorKind[] = [
    {
        aspect: 'interaction',
        description: 'what using or hitting it does',
        hooks: ['useWithoutItem', 'useItemOn', 'attack']
    },
    { aspect: 'scheduled-tick', description: 'what its scheduled ticks do', hooks: ['tick'] },
    { aspect: 'support', description: 'where it can stay and when it breaks off', hooks: ['canSurvive'] },
    {
        aspect: 'neighbor-update',
        description: 'how it reacts to its neighbors changing and to being placed or removed',
        hooks: ['updateShape', 'neighborChanged', 'onPlace', 'affectNeighborsAfterRemoval']
    },
    {
        aspect: 'placement',
        description: 'the state it is placed in and what a placement into it does',
        hooks: ['getStateForPlacement', 'setPlacedBy', 'canBeReplaced']
    },
    {
        aspect: 'redstone',
        description: 'the redstone signal it gives or the comparator reading it has',
        hooks: ['getSignal', 'getDirectSignal', 'isSignalSource', 'getAnalogOutputSignal']
    },
    {
        aspect: 'entity-contact',
        description: 'what it does to an entity inside it, walking on it or falling on it',
        hooks: ['entityInside', 'stepOn', 'fallOn', 'updateEntityMovementAfterFallOn']
    },
    { aspect: 'projectile', description: 'what a projectile hitting it does', hooks: ['onProjectileHit'] },
    {
        aspect: 'breaking',
        description: 'what breaking it or blowing it up does beyond its drops',
        hooks: ['playerWillDestroy', 'playerDestroy', 'spawnAfterBreak', 'onExplosionHit', 'wasExploded']
    },
    {
        aspect: 'block-entity',
        description: 'what its block entity holds and does',
        interfaces: [`${BLOCK_PACKAGE}EntityBlock`]
    },
    {
        aspect: 'bonemeal',
        description: 'what bone meal does to it',
        interfaces: [`${BLOCK_PACKAGE}BonemealableBlock`]
    },
    { aspect: 'falling', description: 'falling when nothing holds it up', interfaces: [`${BLOCK_PACKAGE}Fallable`] },
    {
        aspect: 'waterlogging',
        description: 'holding water and how water flows into and out of it',
        interfaces: [`${BLOCK_PACKAGE}SimpleWaterloggedBlock`, `${BLOCK_PACKAGE}LiquidBlockContainer`]
    }
];

/** One behavior kind a Java block has, with the class members that give it, for the tracker row. */
export interface JavaBlockBehavior {
    readonly kind: JavaBlockBehaviorKind;
    /** The overriding `Class.hook` names or the interface's simple name. */
    readonly evidence: readonly string[];
}

const simpleName = (binary: string): string => binary.slice(binary.lastIndexOf('/') + 1);

/**
 * The behavior kinds a Java block's class adds to the plain block: each hook it or a superclass
 * below `Block` overrides with code, and each marker interface it implements.
 */
export const javaBlockBehaviors = (javaId: string): readonly JavaBlockBehavior[] => {
    const className = javaBlockClassOf(javaId);
    if (className === undefined) return [];
    const overrides = new Map<string, string>();
    for (const entry of ownChain(className)) {
        for (const method of entry.methods) {
            if (method.instructions.length === 0 || overrides.has(method.name)) continue;
            overrides.set(method.name, `${simpleName(entry.name)}.${method.name}`);
        }
    }
    const interfaces = interfacesOf(className);
    return JAVA_BLOCK_BEHAVIOR_KINDS.flatMap((kind) => {
        const evidence = [
            ...(kind.hooks ?? []).flatMap((hook) => overrides.get(hook) ?? []),
            ...(kind.interfaces ?? []).filter((name) => interfaces.has(name)).map(simpleName)
        ];
        return evidence.length === 0 ? [] : [{ kind, evidence }];
    });
};

/** Whether a Java block class is, or extends, the class with this simple name, such as `AirBlock`. */
export const javaBlockIsA = (javaId: string, simple: string): boolean => {
    for (let next = javaBlockClassOf(javaId); next?.startsWith('net/minecraft/') === true;) {
        if (simpleName(next) === simple) return true;
        next = pinnedJavaClassFile(next)?.superName;
    }
    return false;
};

/** Whether a Java block implements `EntityBlock`, which Java's piston refuses to move. */
export const javaBlockHasBlockEntity = (javaId: string): boolean => {
    const className = javaBlockClassOf(javaId);
    return className !== undefined && interfacesOf(className).has(`${BLOCK_PACKAGE}EntityBlock`);
};
