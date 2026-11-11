import type { PublishedPackage } from '../../project.data.mts';

/**
 * The areas the package directory groups packages into, in page order, with the packages in each by
 * their unscoped name. Every published package belongs to exactly one area: `groupPackages` fails the
 * docs build when a package is missing here or a listed one is no longer published.
 */
export const packageAreas = [
    {
        id: 'server',
        title: 'Server',
        description: 'The server itself, its console and the kernel that wires its modules.',
        packages: ['prismarine', 'server', 'console', 'console-protocol', 'kernel']
    },
    {
        id: 'network',
        title: 'Network and protocol',
        description: 'Packets, transports and sign-in, for a server or a client.',
        packages: ['protocol', 'raknet', 'nethernet', 'auth', 'client', 'binaryutils']
    },
    {
        id: 'world',
        title: 'World',
        description: 'Terrain, decoration, light, storage and the systems that tick a world.',
        packages: [
            'worldgen',
            'chunkgen',
            'features',
            'structures',
            'lighting',
            'leveldb',
            'engine-systems',
            'spawning'
        ]
    },
    {
        id: 'gameplay',
        title: 'Gameplay',
        description: 'Blocks, items, entities, commands and the rules that make them vanilla.',
        packages: [
            'content',
            'blocks',
            'block-behaviors',
            'items',
            'item-behaviors',
            'entities',
            'entity-brains',
            'entity-goals',
            'recipes',
            'loot',
            'enchantments',
            'trading',
            'advancements',
            'commands',
            'brigadier',
            'mcfunction',
            'predicates'
        ]
    },
    {
        id: 'data',
        title: 'Data and formats',
        description: 'Game data, identifiers, packs, Molang and the file formats they use.',
        packages: ['bedrock-data', 'minecraft', 'mapping', 'nbt', 'molang', 'packs', 'color-parser']
    },
    {
        id: 'utilities',
        title: 'Utilities',
        description: 'Errors, logging and math shared by the other packages.',
        packages: ['errors', 'logger', 'math']
    }
] as const;

const unscoped = (name: string) => name.slice(name.indexOf('/') + 1);

/** The published packages grouped by area, in area order. Throws when the areas and the packages disagree. */
export function groupPackages(packages: readonly PublishedPackage[]) {
    const byName = new Map(packages.map((pkg) => [unscoped(pkg.name), pkg]));
    const listed = new Set<string>(packageAreas.flatMap((area) => area.packages));
    const unlisted = [...byName.keys()].filter((name) => !listed.has(name));
    if (unlisted.length) throw new Error(`Give these packages an area in packageAreas.ts: ${unlisted.join(', ')}.`);
    return packageAreas.map((area) => ({
        ...area,
        packages: area.packages.map((name) => {
            const pkg = byName.get(name);
            if (!pkg) throw new Error(`packageAreas.ts lists ${name}, which is not a published package.`);
            return pkg;
        })
    }));
}
