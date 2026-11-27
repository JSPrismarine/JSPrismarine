/**
 * The `furnace-shift-click` mechanic of the `gameplay.mechanics` family: which stacks a
 * shift-click puts in a furnace's input slot.
 *
 * Java's server decides that itself, from the furnace's recipes. A Bedrock client decides it on
 * its own side, from the cooking recipes the server's `CraftingData` lists, so the server's half
 * of the rule is to list every input Java's furnaces cook, as the Bedrock Dedicated Server does.
 */
import { item_tags } from '@jsprismarine/bedrock-data';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import { buildNetworkContentPayloads } from '@jsprismarine/prismarine/editions/bedrock/contentPayloads';
import { BEDROCK_STATION_TAGS, STATION_BY_TYPE } from '@jsprismarine/recipes';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { loadCraftingDataCapture, loadJavaFurnaceRecipes } from './goldens.ts';
import { gameplayId } from './javaGameplay.ts';
import { serverContent } from './serverStack.ts';

/** One gameplay identifier a scenario compares, such as `mechanic/furnace-shift-click`. */
interface ShiftClickSubject {
    readonly id: string;
}

const MECHANIC: ShiftClickSubject = { id: gameplayId('mechanic', 'furnace-shift-click') };

/** The stations with a furnace screen, whose input slot a shift-click fills. */
const FURNACE_STATIONS: ReadonlySet<string> = new Set(['furnace', 'blast_furnace', 'smoker']);

/** The aux value an ingredient uses for "any damage". */
const ANY_META = 32767;

/** The items each vanilla Bedrock item tag lists, which the client resolves a tag descriptor by. */
const TAG_MEMBERS = new Map(Object.entries(item_tags));

/** One recipe list entry as `CraftingData` carries it, reduced to what a furnace reads. */
interface ListedEntry {
    readonly station: string;
    readonly ingredients: readonly {
        readonly descriptor:
            | { readonly kind: 'name'; readonly name: string; readonly meta: number }
            | { readonly kind: 'tag'; readonly tag: string }
            | { readonly kind: string }
            | null;
    }[];
}

/**
 * Every input a list of entries offers a furnace station, as `station item meta`.
 *
 * A name the Bedrock Dedicated Server writes as `minecraft:stone:0` is the item with its aux
 * value, and a tag stands for each item the vanilla tag lists.
 */
const furnaceInputs = (entries: readonly ListedEntry[]): Set<string> => {
    const inputs = new Set<string>();
    for (const { station, ingredients } of entries) {
        if (!FURNACE_STATIONS.has(station)) continue;
        for (const { descriptor } of ingredients) {
            if (descriptor === null) continue;
            if ('name' in descriptor) {
                const name = descriptor.name.replace(/:\d+$/, '');
                inputs.add(`${station} ${name} ${descriptor.meta}`);
            } else if ('tag' in descriptor) {
                for (const name of TAG_MEMBERS.get(descriptor.tag) ?? []) inputs.add(`${station} ${name} ${ANY_META}`);
            }
        }
    }
    return inputs;
};

/**
 * Whether a station offers an item, under its own aux value or any.
 *
 * An item the mapping names with aux 0, such as a log or leaves, has no other aux in this
 * protocol, so an entry for aux 0 covers every stack an entry for any aux would.
 */
const offers = (inputs: ReadonlySet<string>, station: string, name: string, meta: number): boolean =>
    inputs.has(`${station} ${name} ${ANY_META}`) ||
    inputs.has(`${station} ${name} ${meta}`) ||
    (meta === ANY_META && inputs.has(`${station} ${name} 0`));

let served: Set<string> | undefined;

/** The furnace inputs the server's `CraftingData` lists to a joining client. */
const servedInputs = (): Set<string> => {
    served ??= furnaceInputs(buildNetworkContentPayloads(serverContent()).crafting.shapeless);
    return served;
};

/** The scenarios that compare what a shift-click puts in a furnace with Java and BDS, one row each. */
export const furnaceShiftClickScenarios: readonly BehaviorScenario<ShiftClickSubject>[] = [
    {
        name: 'furnace-shift-click-java-inputs',
        java: "A shift-clicked stack goes into a furnace's input slot when that furnace has a recipe for it.",
        reference: 'Java AbstractFurnaceMenu.quickMoveStack and canSmelt, and data/minecraft/recipe',
        subjects: () => [MECHANIC],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () => {
            const inputs = servedInputs();
            const missing: string[] = [];
            // Java's own recipe files, so a recipe the server failed to load is missing here too.
            for (const recipe of loadJavaFurnaceRecipes()) {
                const [station] = BEDROCK_STATION_TAGS[STATION_BY_TYPE[recipe.type]];
                for (const javaId of recipe.items) {
                    const mapping = javaItemToBedrock(javaId);
                    if (mapping.kind !== 'mapped') continue;
                    const { identifier, data } = mapping.bedrock;
                    if (!offers(inputs, station, identifier, data ?? 0)) missing.push(`${javaId} at the ${station}`);
                }
            }
            return missing.length === 0
                ? undefined
                : `the client is never told a furnace takes ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}, so a shift-click cannot put them in`;
        }
    },
    {
        name: 'furnace-shift-click-bds-inputs',
        java: 'Every input the Bedrock Dedicated Server lists for a furnace, blast furnace or smoker, the server lists too.',
        reference: "The Bedrock Dedicated Server's CraftingData capture, wire/0x34.bin",
        subjects: () => [MECHANIC],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        classify: () => ({
            kind: 'defect',
            reason: "The item mapping keeps the aux value of the old merged log, wood and leaves items, so the server's furnace entries name an aux no client stack has where BDS names any aux.",
            reference: 'https://github.com/JSPrismarine/JSPrismarine/issues/3832'
        }),
        run: () => {
            const captured = loadCraftingDataCapture();
            const inputs = servedInputs();
            const missing = [...furnaceInputs(captured.shapeless)].filter((input) => {
                const [station = '', name = '', meta = ''] = input.split(' ');
                return !offers(inputs, station, name, Number(meta));
            });
            return missing.length === 0
                ? undefined
                : `the server lists ${missing.length} furnace inputs fewer than BDS, such as ${missing.slice(0, 5).join(', ')}`;
        }
    }
];
