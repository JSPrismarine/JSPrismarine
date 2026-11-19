import type { COMMAND_CATALOG, CommandId, KeyBinding } from '../keymap/catalog';
import { formatBinding } from '../keymap/catalog';
import { fuzzyMatch } from './fuzzy';

/** One thing the palette can find: a console action, a server command, or an online player. */
export type PaletteItem =
    | { kind: 'action'; id: CommandId; title: string; keys?: string }
    | { kind: 'command'; name: string; description?: string }
    | { kind: 'player'; name: string };

/** A palette item that matched the query, with the code points of its label that matched. */
export interface PaletteResult {
    item: PaletteItem;
    positions: number[];
}

/** The text the palette shows for an item and matches the query against. */
export const paletteLabel = (item: PaletteItem): string => (item.kind === 'action' ? item.title : item.name);

/** Where each kind sorts when scores tie, and in an empty query: the console's own actions first. */
const KIND_ORDER: Record<PaletteItem['kind'], number> = { action: 0, command: 1, player: 2 };

/**
 * The palette's items: the catalog's actions with their first key, then server commands, then
 * online players. `exclude` drops actions the palette should not offer, such as opening itself.
 */
export function paletteItems(
    catalog: typeof COMMAND_CATALOG,
    serverCommands: Iterable<{ name: string; description?: string }>,
    playerNames: Iterable<string>,
    exclude: readonly CommandId[] = []
): PaletteItem[] {
    const actions = catalog
        .filter((spec) => !exclude.includes(spec.id))
        .map((spec): PaletteItem => {
            const first: KeyBinding | undefined = spec.bindings[0];
            const hint = 'hint' in spec ? spec.hint : undefined;
            return {
                kind: 'action',
                id: spec.id,
                title: spec.title,
                keys: first === undefined ? hint : formatBinding(first)
            };
        });
    const commands: PaletteItem[] = [...serverCommands]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ name, description }) => ({ kind: 'command', name, description }));
    const players: PaletteItem[] = [...playerNames].sort().map((name) => ({ kind: 'player', name }));
    return [...actions, ...commands, ...players];
}

/**
 * The items that match `query`, best first. An empty query keeps every item in its given order;
 * otherwise items sort by match score, then by kind, then by their given order.
 */
export function filterPalette(items: readonly PaletteItem[], query: string): PaletteResult[] {
    return items
        .flatMap((item, index) => {
            const match = fuzzyMatch(query, paletteLabel(item));
            return match === undefined ? [] : [{ item, index, ...match }];
        })
        .sort((a, b) => b.score - a.score || KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || a.index - b.index)
        .map(({ item, positions }) => ({ item, positions }));
}
