/**
 * The parts of an item stack's state beyond its type, amount, name, lore, damage and dynamic
 * properties: what a stack can break and be placed on, whether it is kept on death and locked,
 * its enchantments, its data value, a book's pages and a dyed color. `serverObjects.ts` reads the
 * rest of a stack's state and passes the parsed state here.
 */
import { isRecord } from '../../isRecord';
import type {
    ScriptBook,
    ScriptBookPage,
    ScriptEnchantment,
    ScriptItem,
    ScriptProperties,
    ScriptPropertyValue,
    ScriptRgb
} from '../world';

const strings = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter((each) => typeof each === 'string') : undefined;

const enchantmentsOf = (value: unknown): ScriptEnchantment[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    return value.flatMap((each) =>
        isRecord(each) && typeof each.id === 'string' && typeof each.level === 'number'
            ? [{ id: each.id, level: each.level }]
            : []
    );
};

const pageOf = (value: unknown): ScriptBookPage[] => {
    if (isRecord(value) && typeof value.text === 'string') return [{ text: value.text }];
    if (isRecord(value) && typeof value.raw === 'string') return [{ raw: value.raw }];
    return [];
};

const bookOf = (value: unknown): ScriptBook | undefined => {
    if (!isRecord(value)) return undefined;
    return {
        pages: Array.isArray(value.pages) ? value.pages.flatMap(pageOf) : [],
        ...(typeof value.title === 'string' ? { title: value.title } : {}),
        ...(typeof value.author === 'string' ? { author: value.author } : {})
    };
};

const rgbOf = (value: unknown): ScriptRgb | undefined =>
    isRecord(value) &&
    typeof value.red === 'number' &&
    typeof value.green === 'number' &&
    typeof value.blue === 'number'
        ? { red: value.red, green: value.green, blue: value.blue }
        : undefined;

/**
 * A stack's block properties as its state holds them: id and value pairs, a vector as its three
 * parts. JSON has no form for the infinities a part can hold, so they travel as text.
 */
const propertiesOf = (value: unknown): ScriptProperties | undefined => {
    if (!Array.isArray(value)) return undefined;
    const properties = new Map<string, ScriptPropertyValue>();
    for (const entry of value) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
        const [id, kept] = entry;
        if (typeof kept === 'number' || typeof kept === 'boolean' || typeof kept === 'string') properties.set(id, kept);
        else if (isRecord(kept)) {
            const [x, y, z] = [kept.x, kept.y, kept.z].map(Number);
            if (x !== undefined && y !== undefined && z !== undefined) properties.set(id, { x, y, z });
        }
    }
    return properties;
};

/** A stack's block properties as its state writes them, which {@link propertiesOf} reads back. */
export const blockPropertiesState = (properties: ScriptProperties): unknown[] =>
    [...properties].map(([id, value]) =>
        typeof value === 'object' ? [id, { x: String(value.x), y: String(value.y), z: String(value.z) }] : [id, value]
    );

/** The extra parts of a stack's parsed state, each left out when absent or empty. */
export const itemExtrasOf = (parsed: Readonly<Record<string, unknown>>): Partial<ScriptItem> => {
    const canDestroy = strings(parsed.canDestroy);
    const canPlaceOn = strings(parsed.canPlaceOn);
    const enchantments = enchantmentsOf(parsed.enchantments);
    const book = bookOf(parsed.book);
    const dyeColor = rgbOf(parsed.dyeColor);
    const blockProperties = propertiesOf(parsed.blockProperties);
    const { lockMode, data } = parsed;
    return {
        ...(canDestroy === undefined || canDestroy.length === 0 ? {} : { canDestroy }),
        ...(canPlaceOn === undefined || canPlaceOn.length === 0 ? {} : { canPlaceOn }),
        ...(parsed.keepOnDeath === true ? { keepOnDeath: true } : {}),
        ...(lockMode === 'inventory' || lockMode === 'slot' ? { lockMode } : {}),
        ...(enchantments === undefined || enchantments.length === 0 ? {} : { enchantments }),
        ...(typeof data === 'number' && data !== 0 ? { data } : {}),
        ...(book === undefined ? {} : { book }),
        ...(dyeColor === undefined ? {} : { dyeColor }),
        ...(parsed.unbreakable === true ? { unbreakable: true } : {}),
        ...(blockProperties === undefined || blockProperties.size === 0 ? {} : { blockProperties })
    };
};

/** The extra parts of a stack, in a fixed order, for comparing two. */
const extrasKey = (item: ScriptItem): string =>
    JSON.stringify([
        item.canDestroy ?? [],
        item.canPlaceOn ?? [],
        item.keepOnDeath === true,
        item.lockMode ?? 'none',
        item.enchantments ?? [],
        item.data ?? 0,
        item.book ?? null,
        item.dyeColor ?? null,
        item.unbreakable === true,
        blockPropertiesState(item.blockProperties ?? new Map())
    ]);

/** Whether two stacks agree on every extra part, which two stacks that merge must. */
export const sameExtras = (a: ScriptItem, b: ScriptItem): boolean => extrasKey(a) === extrasKey(b);
