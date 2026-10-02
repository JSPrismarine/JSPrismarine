/**
 * Reads the recipes out of a Bedrock Dedicated Server and writes them in the shape this
 * codebase reasons in.
 *
 * Run with `pnpm generate:recipes`. The path to BDS is in `datagen/manifest.json`.
 *
 * These are Mojang's own files, in the format addon authors write - not a third party's
 * processed dump - so the names in them agree with the item table BDS itself sends. That
 * agreement is the point: the dump this replaced disagreed with its own companion item map
 * for 58% of the names it used, and the recipes that named a plank were dropped for it.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { readArchive } from './brarchive.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));

/** Vanilla's meta wildcard, as it appears in the files and on the wire. */
const ANY_META = 32767;

/**
 * An item reference, which the format writes in five different ways.
 *
 * A bare string, or an object carrying any of `item`, `data` and `count`. `data` is the meta,
 * and its absence means any - which for an ingredient is a question and for a result is
 * simply zero.
 *
 * The fifth is `{ tag }`, naming what an ingredient must carry rather than what it is. Only
 * the layers use it - the 1.13 baseline named every alternative out in full - and only ever
 * for an ingredient, so a tag on a result is a shape nobody has seen and is refused rather
 * than turned into an item named after a tag.
 */
const toItem = (raw, { wildcard }) => {
    const source = typeof raw === 'string' ? { item: raw } : raw;

    if (source.tag !== undefined) {
        if (!wildcard) throw new Error(`A recipe result is a tag, which has no meaning: ${JSON.stringify(raw)}`);
        return { tag: qualify(source.tag), count: source.count ?? 1 };
    }

    const { name, meta } = split(source.item);

    return rename({
        // A meta spelled into the name is still a meta, and the more specific of the two.
        name,
        meta: meta ?? source.data ?? (wildcard ? ANY_META : 0),
        count: source.count ?? 1
    });
};

/** Some references drop the namespace; everything downstream expects it. */
const qualify = (name) => (name.includes(':') ? name : `minecraft:${name}`);

/**
 * Separates the meta some references spell into the name.
 *
 * A fifth way of writing an item reference, on top of the four above: `minecraft:dye:2` is
 * green dye, `minecraft:coal:1` is charcoal. Read whole, the name is one no item table has
 * ever contained, and every recipe using one was dropped - which is most of the dyes, both
 * coals and the smooth stones.
 * @param {string} raw - the reference as the file writes it.
 * @returns {{name: string, meta: number | null}} the name, and the meta if one was spelled in.
 */
const split = (raw) => {
    const qualified = qualify(raw);
    const parts = qualified.split(':');
    if (parts.length < 3) return { name: qualified, meta: null };

    const meta = Number(parts.pop());
    return Number.isInteger(meta) ? { name: parts.join(':'), meta } : { name: qualified, meta: null };
};

const aliases = JSON.parse(fs.readFileSync(path.resolve(HERE, manifest.recipes.itemAliases), 'utf8'));

/**
 * Brings a legacy item name up to date.
 *
 * Mojang's recipe files still write the names from before the flattening - `reeds` for sugar
 * cane, `sign` for an oak sign, `emptymap`, `netherstar` - while the item table the same
 * server sends knows only the current ones. A recipe naming one of those is a recipe the
 * server cannot resolve, and 52 of them were being dropped on that alone.
 *
 * Two shapes of rename, and they differ in what happens to the meta. A `simple` one is a name
 * for a name and the meta still means what it did: `double_stone_slab` becomes
 * `stone_block_slab` and the meta goes on picking the variant. A `complex` one has the meta
 * folded into the name - `anvil` at meta 4 *is* `chipped_anvil` - so once resolved there is
 * nothing left for the meta to say and it goes to zero.
 * @param {{name: string, meta: number, count: number}} item - the item as the file names it.
 * @returns {{name: string, meta: number, count: number}} the same item, named as the item table names it.
 */
const rename = (item) => {
    const override = manifest.recipes.itemAliasOverrides?.[item.name];
    if (override) return { ...item, name: override };

    const complex = aliases.complex[item.name];
    if (complex) {
        // A wildcard asks about every meta at once, and under a complex rename each meta is a
        // different item: `planks` at any meta is oak *or* spruce *or* birch. Collapsing that
        // to one name is how a stick came to be craftable from oak alone, so the alternatives
        // are carried instead, and the recipe is expanded into one per variant further down.
        if (item.meta === ANY_META) {
            const variants = [...new Set(Object.values(complex))];
            // `family` is the name before the rename, and it is what ties the nine plank slots
            // of a chest together: they are one choice made once, not nine independent ones.
            return { ...item, name: variants[0], meta: 0, variants, family: item.name };
        }

        const resolved = complex[String(item.meta)] ?? complex['0'];
        return resolved ? { ...item, name: resolved, meta: 0 } : item;
    }

    const simple = aliases.simple[item.name];
    return simple ? { ...item, name: simple } : item;
};

/** Every item reference in a recipe, as a place that can be read and written. */
const slotsOf = (recipe) => {
    const places = [];
    const collect = (holder, key) => {
        if (holder[key]) places.push({ holder, key });
    };

    (recipe.slots ?? []).forEach((_, i) => collect(recipe.slots, i));
    (recipe.ingredients ?? []).forEach((_, i) => collect(recipe.ingredients, i));
    collect(recipe, 'input');

    return places;
};

/**
 * Turns one recipe naming a family of items into one recipe per member.
 *
 * Vanilla says "any plank" with a wildcard meta; the wire has no way to say that, and the
 * matcher compares one name to one name. So the recipe that took any plank becomes sixteen
 * recipes that each take one, which is also how the client's own recipe book lists them.
 *
 * Grouping is what keeps this from exploding. A chest is nine plank slots, and they are one
 * family choosing once - nine independent choices would be sixteen to the ninth. Two *different*
 * families in one recipe do multiply, and across all of vanilla that turns 48 recipes into 230.
 * @param {object} recipe - the recipe as read, ingredients possibly carrying `variants`.
 * @returns {object[]} one recipe per combination, ids suffixed to stay distinct.
 */
const expand = (recipe) => {
    const families = new Map();
    for (const { holder, key } of slotsOf(recipe)) {
        const item = holder[key];
        if (!item.variants) continue;

        if (!families.has(item.family)) families.set(item.family, { variants: item.variants, places: [] });
        families.get(item.family).places.push(key);
    }

    if (families.size === 0) return [recipe];

    let out = [{ recipe, suffix: [] }];
    for (const { variants, places } of families.values()) {
        const next = [];
        for (const partial of out) {
            for (const name of variants) {
                const copy = structuredClone(partial.recipe);
                for (const key of places) {
                    const target = key === 'input' ? copy : (copy.slots ?? copy.ingredients);
                    target[key] = { ...target[key], name, meta: 0 };
                    delete target[key].variants;
                    delete target[key].family;
                }
                next.push({ recipe: copy, suffix: [...partial.suffix, name.replace('minecraft:', '')] });
            }
        }
        out = next;
    }

    return out.map(({ recipe: expanded, suffix }) => ({
        ...expanded,
        // Distinct, and readable: net ids index this list and the recipe UUID is a hash of
        // the id, so two sharing one would be two recipes the client cannot tell apart.
        id: `${expanded.id}/${suffix.join('_')}`
    }));
};

/** The station a recipe belongs to. A recipe with several tags is registered under each. */
const stationsOf = (recipe) => recipe.tags ?? [];

const readShaped = (recipe, id) => {
    const height = recipe.pattern.length;
    const width = Math.max(...recipe.pattern.map((row) => row.length));

    // Row major and padded, with a hole where the pattern wants nothing. A short row would
    // otherwise shift every slot after it.
    const slots = [];
    for (const row of recipe.pattern) {
        for (let x = 0; x < width; x++) {
            const key = row[x] ?? ' ';
            const ingredient = key === ' ' ? null : recipe.key[key];
            slots.push(ingredient ? toItem(ingredient, { wildcard: true }) : null);
        }
    }

    return {
        kind: 'shaped',
        id,
        width,
        height,
        slots,
        outputs: outputsOf(recipe.result),
        priority: recipe.priority ?? 0
    };
};

const readShapeless = (recipe, id) => ({
    kind: 'shapeless',
    id,
    ingredients: recipe.ingredients.map((ingredient) => toItem(ingredient, { wildcard: true })),
    outputs: outputsOf(recipe.result),
    priority: recipe.priority ?? 0
});

const readFurnace = (recipe, id) => ({
    kind: 'furnace',
    id,
    input: toItem(recipe.input, { wildcard: true }),
    output: toItem(recipe.output, { wildcard: false })
});

/**
 * The smithing table's three slots, in the order it presents them.
 *
 * Only the transform is read. `minecraft:recipe_smithing_trim` is the other kind and has no
 * `result` at all - the trim's output is the armour that went in, wearing the material that
 * went in with it - so it is not a recipe with an output and does not fit a model that has
 * one. It stays counted among the skipped rather than being turned into something it is not.
 */
const readSmithing = (recipe, id) => ({
    kind: 'smithing',
    id,
    template: toItem(recipe.template, { wildcard: true }),
    input: toItem(recipe.base, { wildcard: true }),
    addition: toItem(recipe.addition, { wildcard: true }),
    output: toItem(recipe.result, { wildcard: false })
});

/** A result is one item or several. */
const outputsOf = (result) =>
    (Array.isArray(result) ? result : [result]).map((item) => toItem(item, { wildcard: false }));

const READERS = {
    'minecraft:recipe_shaped': readShaped,
    'minecraft:recipe_shapeless': readShapeless,
    'minecraft:recipe_furnace': readFurnace,
    'minecraft:recipe_smithing_transform': readSmithing
};

/** A vanilla behaviour pack: the base one, or one of the per-release layers over it. */
const VANILLA_LAYER = /^vanilla(?:_(\d+)\.(\d+)(?:\.(\d+))?)?$/;

/** A layer's version, `[0, 0, 0]` for the base pack, or null if the name is not a layer. */
const versionOf = (name) => {
    const parts = VANILLA_LAYER.exec(name);
    return parts && parts.slice(1).map((part) => Number(part ?? 0));
};

const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * The recipe files of one vanilla layer, by file name, or null when the layer has none.
 *
 * A layer keeps its recipes in one of two places. Up to 1.26.40 they were loose files under
 * `recipes/`; from 1.26.50 the server ships its packs "optimized", and the folder is one
 * `__brarchive/recipes.brarchive` instead. A server in between has both, with the same
 * contents, and the loose files are read then because they are the ones a person can see.
 */
const recipeFilesOf = (pack) => {
    const loose = path.join(pack, 'recipes');
    if (fs.existsSync(loose)) {
        return new Map(
            fs
                .readdirSync(loose)
                .filter((file) => file.endsWith('.json'))
                .map((file) => [file, fs.readFileSync(path.join(loose, file))])
        );
    }

    const archive = path.join(pack, '__brarchive', 'recipes.brarchive');
    return fs.existsSync(archive) ? readArchive(archive) : null;
};

/**
 * The vanilla recipe layers to read, oldest first.
 *
 * BDS does not ship one set of recipes; it ships a 1.13 baseline and a layer per release on
 * top, and the game composes them. Reading only `vanilla` gets the baseline: of the 1744
 * recipes that exist at 1.26.40 it has 990, and even those are stale - its `furnace_beef` has
 * no `unlock`, no `priority` and does not know about the soul campfire.
 *
 * Layers past the version in the manifest are left out, so pointing this at a preview server
 * still produces the pinned version's recipes rather than quietly a newer set. `chemistry` and
 * the `experimental_` packs are not layers - they are opt-in and off by default - and are
 * excluded by the name alone.
 */
const layersOf = (root) => {
    const packs = path.join(root, manifest.recipes.source);
    if (!fs.existsSync(packs)) return [];

    const target = versionOf(`vanilla_${manifest.schemas.minecraftVersion}`);

    return fs
        .readdirSync(packs)
        .map((name) => ({ name, version: versionOf(name) }))
        .filter(({ name, version }) => version !== null && compareVersions(version, target) <= 0)
        .sort((a, b) => compareVersions(a.version, b.version))
        .map(({ name }) => ({ name, files: recipeFilesOf(path.join(packs, name)) }))
        .filter(({ files }) => files !== null);
};

/**
 * Every recipe the composed layers define, by identifier, with the last layer winning.
 *
 * A later definition replaces an earlier one in place rather than being appended, so a recipe
 * that has been revised keeps the position it has always had and only its contents move. That
 * keeps the output stable against a version bump that changes no ordering.
 */
const composeLayers = (layers) => {
    const definitions = new Map();

    for (const { name, files } of layers) {
        for (const file of [...files.keys()].sort()) {
            if (!file.endsWith('.json')) continue;

            const contents = JSON.parse(files.get(file).toString('utf8'));

            for (const [kind, recipe] of Object.entries(contents)) {
                if (kind === 'format_version') continue;

                const id = recipe.description?.identifier ?? path.basename(file, '.json');
                definitions.set(id, { kind, recipe, id, layer: name });
            }
        }
    }

    return definitions;
};

const main = () => {
    // The environment wins, so regenerating needs no edit to a committed file - and so the
    // path to a 58 MB download nobody else has does not arrive in a diff.
    const root = path.resolve(HERE, process.env.BEDROCK_SERVER ?? manifest.recipes.bedrockServer);
    const layers = layersOf(root);

    if (layers.length === 0) {
        console.error(
            `No vanilla recipe layers under ${path.join(root, manifest.recipes.source)}.\n` +
                `Point \`BEDROCK_SERVER\` or \`recipes.bedrockServer\` in datagen/manifest.json at an ` +
                `unpacked Bedrock Dedicated Server ${manifest.schemas.minecraftVersion}.`
        );
        process.exit(1);
    }

    const recipes = [];
    const skipped = new Map();

    for (const { kind, recipe, id } of composeLayers(layers).values()) {
        const reader = READERS[kind];
        if (!reader) {
            // Brewing, and whatever Mojang adds next. Counted rather than passed over in
            // silence: a kind that appears and is ignored should be visible.
            skipped.set(kind, (skipped.get(kind) ?? 0) + 1);
            continue;
        }

        for (const station of stationsOf(recipe)) {
            for (const expanded of expand(reader(recipe, `${station}/${id}`))) {
                recipes.push({ ...expanded, station });
            }
        }
    }

    const output = {
        $comment:
            'Generated by packages/minecraft/datagen/generate-recipes.js from a Bedrock Dedicated ' +
            'Server - do not edit. Change the manifest and run `pnpm generate:recipes`.',
        minecraftVersion: manifest.schemas.minecraftVersion,
        layers: layers.map(({ name }) => name),
        count: recipes.length,
        recipes
    };

    const target = path.resolve(HERE, manifest.recipes.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(output, null, 0)}\n`);

    console.log(`Wrote ${path.relative(process.cwd(), target)}`);
    console.log(`  ${layers.length} vanilla layers, ${layers.at(-1).name} last`);
    console.log(`  ${recipes.length} recipes`);
    for (const [kind, count] of skipped) console.log(`  skipped ${count} ${kind}`);
};

main();
