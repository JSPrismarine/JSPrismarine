import type { BedrockBlockProperties } from '@jsprismarine/mapping';

import { behaviorFor } from './families';
import containerOpenSounds from './tables/containerOpenSounds.json';
import vanillaBlockTags from './tables/vanillaBlockTags.json';

const BEDROCK_BLOCK_TAGS = new Map(Object.entries(vanillaBlockTags));

/**
 * Where the generator reads a block's properties from.
 *
 * The generator takes this rather than importing `@jsprismarine/mapping`
 * directly so the package script can run under plain `node`, which cannot
 * load that package's JSON table without an import attribute. The
 * mapping-backed source is {@link JAVA_BLOCK_PROPERTIES}, and the overlay
 * test checks that the two agree file for file.
 */
export interface BlockPropertySource {
    /** Identifiers no Java block state maps onto, which take the fallback. */
    readonly bedrockOnly: ReadonlySet<string>;
    /** The Java-sourced row for one block, or undefined for a Bedrock-only one. */
    propertiesOf(identifier: string): BedrockBlockProperties | undefined;
}

/** The pack identifier the overlay declares, which is also its folder name. */
export const OVERLAY_PACK_NAME = 'jsprismarine_vanilla';

/** The `format_version` every overlay block file declares. */
export const OVERLAY_FORMAT_VERSION = '1.26.20';

/** Mojang's `minecraft:friction` caps here, so the component is clamped to it. */
export const BEDROCK_FRICTION_CAP = 0.9;

/**
 * The properties a Bedrock-only block takes, since no Java block state maps
 * onto it and `@jsprismarine/mapping` publishes no row for it.
 *
 * The values are the engine's defaults for a plain full cube that breaks
 * instantly. Every block that takes them is listed in the generated
 * `exceptions.json` with a reason, so the fallback is reviewed rather than
 * silent.
 */
export const BEDROCK_ONLY_FALLBACK: BedrockBlockProperties = {
    hardness: 0,
    blastResistance: 0,
    friction: 0.6,
    lightEmission: 0,
    lightDampening: 15,
    requiresCorrectTool: false,
    randomTick: false,
    pushReaction: 'push_pull',
    igniteOdds: 0,
    burnOdds: 0
};

/** Why one Bedrock-only block has no Java row, by the group it belongs to. */
const EXCEPTION_REASONS: readonly { readonly reason: string; readonly matches: (name: string) => boolean }[] = [
    {
        reason: 'Education Edition chemistry, which Java Edition has no equivalent of',
        matches: (name) =>
            name.startsWith('element_') ||
            name.startsWith('hard_') ||
            name.startsWith('colored_torch_') ||
            [
                'element_constructor',
                'compound_creator',
                'lab_table',
                'material_reducer',
                'chemical_heat',
                'underwater_torch',
                'underwater_tnt'
            ].includes(name)
    },
    {
        reason: 'a Bedrock world-editing block with no Java counterpart',
        matches: (name) => ['allow', 'deny', 'border_block', 'camera', 'chalkboard'].includes(name)
    },
    {
        reason: 'a deprecated palette entry the game keeps for old worlds',
        matches: (name) =>
            name.startsWith('deprecated_') ||
            ['glowingobsidian', 'netherreactor', 'reserved6', 'info_update', 'info_update2', 'stonecutter'].includes(
                name
            )
    },
    {
        reason: 'an entity in Java Edition rather than a block',
        matches: (name) => ['frame', 'glow_frame'].includes(name)
    },
    {
        reason: 'an engine-internal block the player never places',
        matches: (name) => ['client_request_placeholder_block', 'invisible_bedrock'].includes(name)
    }
];

/**
 * The blocks the overlay gives `"minecraft:collision_box": false`.
 *
 * `@jsprismarine/mapping` publishes no solidity column, so the generator
 * cannot derive collision for the palette at large. These are the states
 * nothing can ever stand in, written down with a reason rather than inferred.
 */
const WITHOUT_COLLISION: readonly { readonly identifier: string; readonly reason: string }[] = [
    { identifier: 'minecraft:air', reason: 'air occupies nothing' },
    { identifier: 'minecraft:water', reason: 'a liquid has no collision surface' },
    { identifier: 'minecraft:flowing_water', reason: 'a flowing liquid has no collision surface' },
    { identifier: 'minecraft:lava', reason: 'a liquid has no collision surface' },
    { identifier: 'minecraft:flowing_lava', reason: 'a flowing liquid has no collision surface' },
    { identifier: 'minecraft:structure_void', reason: 'the structure editor placeholder has no shape' },
    { identifier: 'minecraft:portal', reason: 'a nether portal is a volume an entity walks into' },
    { identifier: 'minecraft:end_portal', reason: 'an end portal is a volume an entity walks into' },
    { identifier: 'minecraft:moving_block', reason: "a piston's temporary block carries the moved block's shape" },
    { identifier: 'minecraft:client_request_placeholder_block', reason: 'an engine-internal marker with no shape' },
    ...Array.from({ length: 16 }, (_unused, level) => ({
        identifier: `minecraft:light_block_${level}`,
        reason: 'a light source with no shape'
    }))
];

/** How Java's push reaction is written in Bedrock's `Movement Type` enum. */
const MOVEMENT_TYPES: Readonly<Record<string, string>> = {
    push_pull: 'push_pull',
    push: 'push',
    popped: 'popped',
    immoveable: 'immovable'
};

/** One file of the generated overlay pack. */
export interface OverlayFile {
    /** The pack-relative path, with `/` separators. */
    readonly path: string;
    /** The file's text, newline terminated. */
    readonly content: string;
}

/** One block that took {@link BEDROCK_ONLY_FALLBACK} instead of a Java row. */
export interface OverlayException {
    readonly identifier: string;
    readonly behavior: string;
    readonly reason: string;
}

/** One block whose Java friction does not fit Mojang's `minecraft:friction` range. */
export interface FrictionClamp {
    readonly identifier: string;
    /** The Java value, which `jsprismarine:block_properties` keeps. */
    readonly javaFriction: number;
    /** What `minecraft:friction` was written as. */
    readonly clampedTo: number;
}

/** What {@link generateVanillaOverlay} produced. */
export interface OverlayPack {
    /** Every file, `manifest.json` first, then one per block, then the reports. */
    readonly files: readonly OverlayFile[];
    /** The Bedrock-only blocks, in palette order. */
    readonly exceptions: readonly OverlayException[];
    /** The blocks whose Java friction Mojang's component cannot hold. */
    readonly frictionClamps: readonly FrictionClamp[];
    /** How many blocks each behavior family claimed, highest first. */
    readonly behaviorCounts: Readonly<Record<string, number>>;
}

const reasonFor = (identifier: string): string => {
    const name = identifier.replace(/^[^:]*:/, '');
    return (
        EXCEPTION_REASONS.find((group) => group.matches(name))?.reason ??
        'no Java block state maps onto it and no group explains why'
    );
};

const fileNameFor = (identifier: string): string => `${identifier.replace(/^[^:]*:/, '')}.block.json`;

/**
 * Serializes one file the way Prettier would, so the committed pack passes
 * `prettier --check` without a second pass: four-space indent, every object
 * expanded, and an array inlined when the whole line fits the 120-column
 * width the repository's Prettier configuration sets.
 */
const render = (value: unknown, column: number, indent: string): string => {
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const inline = `[${value.map((item) => render(item, 0, '')).join(', ')}]`;
        if (!inline.includes('\n') && column + inline.length <= PRINT_WIDTH) return inline;
        const inner = `${indent}    `;
        return `[\n${value.map((item) => `${inner}${render(item, inner.length, inner)}`).join(',\n')}\n${indent}]`;
    }

    if (typeof value === 'object' && value !== null) {
        const entries = Object.entries(value).filter(([, member]) => member !== undefined);
        if (entries.length === 0) return '{}';
        const inner = `${indent}    `;
        const lines = entries.map(([key, member]) => {
            const prefix = `${inner}${JSON.stringify(key)}: `;
            return `${prefix}${render(member, prefix.length, inner)}`;
        });
        return `{\n${lines.join(',\n')}\n${indent}}`;
    }

    return JSON.stringify(value);
};

/** The `printWidth` the repository's Prettier configuration sets. */
const PRINT_WIDTH = 120;

const json = (value: unknown): string => `${render(value, 0, '')}\n`;

/**
 * Builds the `jsprismarine_vanilla` overlay: a Bedrock behavior pack that
 * declares one block definition for every block in the palette.
 *
 * The Bedrock-expressible properties become real Bedrock components with the
 * values `bedrockBlockPropertiesOf` publishes. The rest go in
 * `jsprismarine:block_properties`, this project's own component, because
 * Bedrock's grammar has no field for them: friction above 0.9, random
 * ticking, the correct-tool requirement, and the piston reaction at Java's
 * precision. The behavior family comes from the identifier, which is the same
 * mechanism as Mojang's `block_archetype` and produces the same names for the
 * families Mojang already named.
 *
 * @param properties - Where each block's Java-sourced row comes from.
 * @param identifiers - Every block to declare, such as the identifiers of
 *   `vanillaBlockPalette().entries`. The output order follows this list.
 * @returns Every file to write, plus the reviewed exception list and the
 *   friction clamps.
 */
export const generateVanillaOverlay = (
    properties: BlockPropertySource,
    identifiers: readonly string[]
): OverlayPack => {
    const files: OverlayFile[] = [];
    const exceptions: OverlayException[] = [];
    const frictionClamps: FrictionClamp[] = [];
    const behaviorCounts = new Map<string, number>();
    const withoutCollision = new Map(WITHOUT_COLLISION.map((entry) => [entry.identifier, entry.reason]));

    files.push({
        path: 'manifest.json',
        content: json({
            format_version: 2,
            header: {
                name: 'JSPrismarine vanilla overlay',
                description:
                    'Generated by @jsprismarine/blocks. One block definition per palette block, with the Java-sourced property table behind it.',
                uuid: '2b0f8f2e-9a4c-4c1a-9f0b-4f2d1c6a7e10',
                version: [0, 1, 0],
                min_engine_version: [1, 26, 50]
            },
            modules: [{ type: 'data', uuid: 'a6b1f0c3-5d47-4f93-8a21-0c6e9d3b5172', version: [0, 1, 0] }]
        })
    });

    for (const identifier of identifiers) {
        const bedrockOnly = properties.bedrockOnly.has(identifier);
        const row = properties.propertiesOf(identifier) ?? BEDROCK_ONLY_FALLBACK;
        const behavior = behaviorFor(identifier);
        behaviorCounts.set(behavior, (behaviorCounts.get(behavior) ?? 0) + 1);

        if (bedrockOnly) exceptions.push({ identifier, behavior, reason: reasonFor(identifier) });

        const friction = Math.min(row.friction, BEDROCK_FRICTION_CAP);
        if (friction !== row.friction) {
            frictionClamps.push({ identifier, javaFriction: row.friction, clampedTo: friction });
        }

        const components: Record<string, unknown> = {
            'minecraft:destructible_by_mining': row.hardness < 0 ? false : { seconds_to_destroy: row.hardness },
            'minecraft:destructible_by_explosion': { explosion_resistance: row.blastResistance },
            'minecraft:friction': friction,
            'minecraft:light_emission': row.lightEmission,
            'minecraft:light_dampening': row.lightDampening,
            'minecraft:movable': { movement_type: MOVEMENT_TYPES[row.pushReaction] ?? 'push_pull' }
        };

        const tags = BEDROCK_BLOCK_TAGS.get(identifier);
        if (tags !== undefined) components['minecraft:tags'] = tags;

        if (row.igniteOdds > 0 || row.burnOdds > 0) {
            components['minecraft:flammable'] = {
                catch_chance_modifier: row.igniteOdds,
                destroy_chance_modifier: row.burnOdds
            };
        }

        if (withoutCollision.has(identifier)) components['minecraft:collision_box'] = false;

        components['jsprismarine:behavior'] = behavior;
        components['jsprismarine:block_properties'] = {
            friction: row.friction,
            random_tick: row.randomTick,
            requires_correct_tool: row.requiresCorrectTool,
            push_reaction: MOVEMENT_TYPES[row.pushReaction] ?? 'push_pull',
            source: bedrockOnly ? 'fallback' : 'java'
        };

        const openSound =
            containerOpenSounds.blocks.find((entry) => entry.identifier === identifier)?.sound ??
            containerOpenSounds.behaviors.find((entry) => entry.behavior === behavior)?.sound;
        if (openSound !== undefined) components['jsprismarine:container_open_sound'] = openSound;

        files.push({
            path: `blocks/${fileNameFor(identifier)}`,
            content: json({
                format_version: OVERLAY_FORMAT_VERSION,
                'minecraft:block': { description: { identifier }, components }
            })
        });
    }

    const counts = Object.fromEntries([...behaviorCounts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));

    files.push({
        path: 'exceptions.json',
        content: json({
            $comment:
                'Palette blocks no Java block state maps onto. Each takes BEDROCK_ONLY_FALLBACK from @jsprismarine/blocks and is reviewed here rather than defaulted silently.',
            count: exceptions.length,
            blocks: exceptions
        })
    });

    files.push({
        path: 'report.json',
        content: json({
            $comment:
                'Generated beside the pack by `pnpm --filter @jsprismarine/blocks run generate:overlay`. Not read at runtime.',
            blockCount: identifiers.length,
            exceptionCount: exceptions.length,
            frictionClamps,
            withoutCollision: WITHOUT_COLLISION,
            behaviorCounts: counts
        })
    });

    return { files, exceptions, frictionClamps, behaviorCounts: counts };
};
