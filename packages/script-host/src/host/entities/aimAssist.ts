/**
 * The aim assist registry of `@minecraft/server`: `world.getAimAssist()`, `AimAssistRegistry`,
 * the registered `AimAssistCategory` and `AimAssistPreset`, and the `AimAssistCategorySettings`
 * and `AimAssistPresetSettings` a script builds before it registers them.
 *
 * The vanilla entries are the ones the world sends its clients ({@link ScriptEntitySystems.aimAssist}),
 * and a script's additions join them for every pack of the world. The values follow the
 * `entity-values` scenario recorded on the pinned Bedrock Dedicated Server, which registers a
 * category after `startup` without an error.
 */
import { ScriptApiError } from '../../errors';
import { isRecord } from '../../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { SERVER } from '../serverObjects';
import { ENTITY_AREA_TAG, scriptArray } from './components';
import type { ScriptAimAssistCategory, ScriptAimAssistPreset, ScriptAimAssistRegistry } from './world';

/** What scripts registered in each world, beside its vanilla entries. */
const added = new WeakMap<object, { categories: ScriptAimAssistCategory[]; presets: ScriptAimAssistPreset[] }>();

/** The world's registry: the vanilla entries, then the ones scripts registered. */
const registryOf = (host: PackHost): ScriptAimAssistRegistry => {
    const vanilla = host.world.entitySystems?.aimAssist() ?? { categories: [], presets: [] };
    const extra = added.get(host.world);
    return extra === undefined
        ? vanilla
        : { categories: [...vanilla.categories, ...extra.categories], presets: [...vanilla.presets, ...extra.presets] };
};

/** Whether the world's registry has a preset, as `PlayerAimAssist.set` checks. */
export const aimAssistPresetExists = (host: PackHost, identifier: string): boolean =>
    registryOf(host).presets.some((preset) => preset.identifier === identifier);

const record = (value: unknown): Readonly<Record<string, unknown>> => (isRecord(value) ? value : {});
const numbers = (value: unknown): Record<string, number> =>
    Object.fromEntries(
        Object.entries(record(value)).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    );
const texts = (value: unknown): Record<string, string> =>
    Object.fromEntries(
        Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
const list = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter((each) => typeof each === 'string') : undefined;

/** The category a settings object holds now. */
const categoryOf = (state: string): ScriptAimAssistCategory => {
    // The host wrote the state with JSON.stringify.
    const fields = record(JSON.parse(state));
    return {
        identifier: String(fields.identifier ?? ''),
        defaultBlockPriority: typeof fields.defaultBlockPriority === 'number' ? fields.defaultBlockPriority : 1,
        defaultEntityPriority: typeof fields.defaultEntityPriority === 'number' ? fields.defaultEntityPriority : 1,
        blocks: numbers(fields.blocks),
        entities: numbers(fields.entities),
        blockTags: numbers(fields.blockTags),
        entityTypeFamilies: numbers(fields.entityTypeFamilies)
    };
};

/** The preset a settings object holds now; a list it never set is absent. */
const presetSettingsOf = (state: string) => {
    // The host wrote the state with JSON.stringify.
    const fields = record(JSON.parse(state));
    return {
        identifier: String(fields.identifier ?? ''),
        defaultItemSettings: typeof fields.defaultItemSettings === 'string' ? fields.defaultItemSettings : undefined,
        handSettings: typeof fields.handSettings === 'string' ? fields.handSettings : undefined,
        excludedBlocks: list(fields.excludedBlocks),
        excludedEntities: list(fields.excludedEntities),
        excludedBlockTags: list(fields.excludedBlockTags),
        excludedEntityTypeFamilies: list(fields.excludedEntityTypeFamilies),
        itemSettings: texts(fields.itemSettings),
        liquidTargetingItems: list(fields.liquidTargetingItems)
    };
};

/** BDS's errors for an identifier without a namespace or in `minecraft`. */
const checkNamespace = (identifier: string): void => {
    const [namespace, name] = identifier.split(':');
    if (name === undefined || namespace === '' || name === '') {
        throw new ScriptApiError(
            SERVER,
            'NamespaceNameError',
            'string must be prefixed with a namespace (eg. namespace:value).'
        );
    }
    if (namespace === 'minecraft')
        throw new ScriptApiError(SERVER, 'NamespaceNameError', 'string has invalid namespace (minecraft).');
};

/**
 * Registers the aim assist members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementAimAssist = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const array = (items: readonly ScriptHandle[]): ScriptHandle => scriptArray(host, items);
    const categoryObject = (identifier: string) =>
        host.engine.release(host.create('AimAssistCategory', ENTITY_AREA_TAG.aimAssistCategory, identifier));
    const presetObject = (identifier: string) =>
        host.engine.release(host.create('AimAssistPreset', ENTITY_AREA_TAG.aimAssistPreset, identifier));
    const category = (call: ScriptCall): ScriptAimAssistCategory => {
        const found = registryOf(host).categories.find((each) => each.identifier === call.state);
        if (found === undefined)
            throw new ScriptApiError(SERVER, 'Error', 'The aim assist category is no longer registered.');
        return found;
    };
    const preset = (call: ScriptCall): ScriptAimAssistPreset => {
        const found = registryOf(host).presets.find((each) => each.identifier === call.state);
        if (found === undefined)
            throw new ScriptApiError(SERVER, 'Error', 'The aim assist preset is no longer registered.');
        return found;
    };
    const addedOf = () => {
        const found = added.get(host.world) ?? { categories: [], presets: [] };
        added.set(host.world, found);
        return found;
    };
    const settingsState = (call: ScriptCall, index: number): string => {
        const value = call.args[index];
        return value instanceof ScriptHandle ? call.stateOf(value) : '';
    };

    implementations
        .implement(SERVER, 'World', 'getAimAssist', () =>
            host.instance('AimAssistRegistry', ENTITY_AREA_TAG.aimAssistRegistry)
        )
        .implement(SERVER, 'AimAssistRegistry', 'getCategories', () =>
            array(registryOf(host).categories.map((each) => categoryObject(each.identifier)))
        )
        .implement(SERVER, 'AimAssistRegistry', 'getPresets', () =>
            array(registryOf(host).presets.map((each) => presetObject(each.identifier)))
        )
        .implement(SERVER, 'AimAssistRegistry', 'getCategory', (call) => {
            const identifier = String(call.args[0]);
            return registryOf(host).categories.some((each) => each.identifier === identifier)
                ? categoryObject(identifier)
                : undefined;
        })
        .implement(SERVER, 'AimAssistRegistry', 'getPreset', (call) => {
            const identifier = String(call.args[0]);
            return registryOf(host).presets.some((each) => each.identifier === identifier)
                ? presetObject(identifier)
                : undefined;
        })
        .implement(SERVER, 'AimAssistRegistry', 'addCategory', (call) => {
            const settings = categoryOf(settingsState(call, 0));
            checkNamespace(settings.identifier);
            if (registryOf(host).categories.some((each) => each.identifier === settings.identifier)) {
                throw new ScriptApiError(
                    SERVER,
                    'Error',
                    `Aim assist category '${settings.identifier}' is already registered.`
                );
            }
            addedOf().categories.push(settings);
            host.world.entitySystems?.addAimAssist({ categories: [settings], presets: [] });
            return categoryObject(settings.identifier);
        })
        .implement(SERVER, 'AimAssistRegistry', 'addPreset', (call) => {
            const settings = presetSettingsOf(settingsState(call, 0));
            checkNamespace(settings.identifier);
            if (registryOf(host).presets.some((each) => each.identifier === settings.identifier)) {
                throw new ScriptApiError(
                    SERVER,
                    'Error',
                    `Aim assist preset '${settings.identifier}' is already registered.`
                );
            }
            const registered: ScriptAimAssistPreset = {
                identifier: settings.identifier,
                ...(settings.defaultItemSettings === undefined
                    ? {}
                    : { defaultItemSettings: settings.defaultItemSettings }),
                ...(settings.handSettings === undefined ? {} : { handSettings: settings.handSettings }),
                excludedBlocks: settings.excludedBlocks ?? [],
                excludedEntities: settings.excludedEntities ?? [],
                excludedBlockTags: settings.excludedBlockTags ?? [],
                excludedEntityTypeFamilies: settings.excludedEntityTypeFamilies ?? [],
                itemSettings: settings.itemSettings,
                liquidTargetingItems: settings.liquidTargetingItems ?? []
            };
            addedOf().presets.push(registered);
            host.world.entitySystems?.addAimAssist({ categories: [], presets: [registered] });
            return presetObject(settings.identifier);
        });

    implementations
        .implement(SERVER, 'AimAssistCategory', 'identifier', { get: (call) => category(call).identifier })
        .implement(SERVER, 'AimAssistCategory', 'defaultBlockPriority', {
            get: (call) => category(call).defaultBlockPriority
        })
        .implement(SERVER, 'AimAssistCategory', 'defaultEntityPriority', {
            get: (call) => category(call).defaultEntityPriority
        })
        .implement(SERVER, 'AimAssistCategory', 'getBlockPriorities', (call) => JSON.stringify(category(call).blocks))
        .implement(SERVER, 'AimAssistCategory', 'getEntityPriorities', (call) =>
            JSON.stringify(category(call).entities)
        )
        .implement(SERVER, 'AimAssistCategory', 'getBlockTagPriorities', (call) =>
            JSON.stringify(category(call).blockTags)
        )
        .implement(SERVER, 'AimAssistCategory', 'getEntityTypeFamilyPriorities', (call) =>
            JSON.stringify(category(call).entityTypeFamilies)
        )
        .implement(SERVER, 'AimAssistPreset', 'identifier', { get: (call) => preset(call).identifier })
        .implement(SERVER, 'AimAssistPreset', 'defaultItemSettings', {
            get: (call) => preset(call).defaultItemSettings
        })
        .implement(SERVER, 'AimAssistPreset', 'handSettings', { get: (call) => preset(call).handSettings })
        .implement(SERVER, 'AimAssistPreset', 'getExcludedBlockTargets', (call) =>
            JSON.stringify(preset(call).excludedBlocks)
        )
        .implement(SERVER, 'AimAssistPreset', 'getExcludedEntityTargets', (call) =>
            JSON.stringify(preset(call).excludedEntities)
        )
        .implement(SERVER, 'AimAssistPreset', 'getExcludedBlockTagTargets', (call) =>
            JSON.stringify(preset(call).excludedBlockTags)
        )
        .implement(SERVER, 'AimAssistPreset', 'getExcludedEntityTypeFamilyTargets', (call) =>
            JSON.stringify(preset(call).excludedEntityTypeFamilies)
        )
        .implement(SERVER, 'AimAssistPreset', 'getItemSettings', (call) => JSON.stringify(preset(call).itemSettings))
        .implement(SERVER, 'AimAssistPreset', 'getLiquidTargetingItems', (call) =>
            JSON.stringify(preset(call).liquidTargetingItems)
        );

    const updateCategory = (call: ScriptCall, change: Partial<ScriptAimAssistCategory>): void =>
        call.setState(JSON.stringify({ ...categoryOf(call.state), ...change }));
    const recordArgument = (call: ScriptCall): unknown => {
        const json = call.stringify(call.args[0]);
        // The engine wrote the string with JSON.stringify.
        return json === undefined ? {} : JSON.parse(json);
    };
    implementations
        .implement(SERVER, 'AimAssistCategorySettings', 'constructor', (call) =>
            JSON.stringify({ identifier: String(call.args[0]) })
        )
        .implement(SERVER, 'AimAssistCategorySettings', 'identifier', {
            get: (call) => categoryOf(call.state).identifier
        })
        .implement(SERVER, 'AimAssistCategorySettings', 'defaultBlockPriority', {
            get: (call) => categoryOf(call.state).defaultBlockPriority,
            set: (call) => updateCategory(call, { defaultBlockPriority: Math.trunc(Number(call.args[0])) })
        })
        .implement(SERVER, 'AimAssistCategorySettings', 'defaultEntityPriority', {
            get: (call) => categoryOf(call.state).defaultEntityPriority,
            set: (call) => updateCategory(call, { defaultEntityPriority: Math.trunc(Number(call.args[0])) })
        })
        .implement(SERVER, 'AimAssistCategorySettings', 'getBlockPriorities', (call) =>
            JSON.stringify(categoryOf(call.state).blocks)
        )
        .implement(SERVER, 'AimAssistCategorySettings', 'getEntityPriorities', (call) =>
            JSON.stringify(categoryOf(call.state).entities)
        )
        .implement(SERVER, 'AimAssistCategorySettings', 'getBlockTagPriorities', (call) =>
            JSON.stringify(categoryOf(call.state).blockTags)
        )
        .implement(SERVER, 'AimAssistCategorySettings', 'getEntityTypeFamilyPriorities', (call) =>
            JSON.stringify(categoryOf(call.state).entityTypeFamilies)
        )
        .implement(SERVER, 'AimAssistCategorySettings', 'setBlockPriorities', (call) => {
            updateCategory(call, { blocks: numbers(recordArgument(call)) });
            return undefined;
        })
        .implement(SERVER, 'AimAssistCategorySettings', 'setEntityPriorities', (call) => {
            updateCategory(call, { entities: numbers(recordArgument(call)) });
            return undefined;
        })
        .implement(SERVER, 'AimAssistCategorySettings', 'setBlockTagPriorities', (call) => {
            updateCategory(call, { blockTags: numbers(recordArgument(call)) });
            return undefined;
        })
        .implement(SERVER, 'AimAssistCategorySettings', 'setEntityTypeFamilyPriorities', (call) => {
            updateCategory(call, { entityTypeFamilies: numbers(recordArgument(call)) });
            return undefined;
        });

    const updatePreset = (call: ScriptCall, change: Readonly<Record<string, unknown>>): void =>
        call.setState(JSON.stringify({ ...presetSettingsOf(call.state), ...change }));
    const listArgument = (call: ScriptCall): string[] | undefined =>
        list(call.args[0] === undefined ? undefined : recordArgument(call));
    const presetList = (
        key:
            | 'excludedBlocks'
            | 'excludedEntities'
            | 'excludedBlockTags'
            | 'excludedEntityTypeFamilies'
            | 'liquidTargetingItems'
    ) => ({
        get: (call: ScriptCall) => {
            const found = presetSettingsOf(call.state)[key];
            return found === undefined ? undefined : JSON.stringify(found);
        },
        set: (call: ScriptCall) => {
            updatePreset(call, { [key]: listArgument(call) });
            return undefined;
        }
    });
    const excludedBlocks = presetList('excludedBlocks');
    const excludedEntities = presetList('excludedEntities');
    const excludedBlockTags = presetList('excludedBlockTags');
    const excludedFamilies = presetList('excludedEntityTypeFamilies');
    const liquid = presetList('liquidTargetingItems');
    implementations
        .implement(SERVER, 'AimAssistPresetSettings', 'constructor', (call) =>
            JSON.stringify({ identifier: String(call.args[0]) })
        )
        .implement(SERVER, 'AimAssistPresetSettings', 'identifier', {
            get: (call) => presetSettingsOf(call.state).identifier
        })
        .implement(SERVER, 'AimAssistPresetSettings', 'defaultItemSettings', {
            get: (call) => presetSettingsOf(call.state).defaultItemSettings,
            set: (call) =>
                updatePreset(call, { defaultItemSettings: typeof call.args[0] === 'string' ? call.args[0] : undefined })
        })
        .implement(SERVER, 'AimAssistPresetSettings', 'handSettings', {
            get: (call) => presetSettingsOf(call.state).handSettings,
            set: (call) =>
                updatePreset(call, { handSettings: typeof call.args[0] === 'string' ? call.args[0] : undefined })
        })
        .implement(SERVER, 'AimAssistPresetSettings', 'getExcludedBlockTargets', excludedBlocks.get)
        .implement(SERVER, 'AimAssistPresetSettings', 'setExcludedBlockTargets', excludedBlocks.set)
        .implement(SERVER, 'AimAssistPresetSettings', 'getExcludedEntityTargets', excludedEntities.get)
        .implement(SERVER, 'AimAssistPresetSettings', 'setExcludedEntityTargets', excludedEntities.set)
        .implement(SERVER, 'AimAssistPresetSettings', 'getExcludedBlockTagTargets', excludedBlockTags.get)
        .implement(SERVER, 'AimAssistPresetSettings', 'setExcludedBlockTagTargets', excludedBlockTags.set)
        .implement(SERVER, 'AimAssistPresetSettings', 'getExcludedEntityTypeFamilyTargets', excludedFamilies.get)
        .implement(SERVER, 'AimAssistPresetSettings', 'setExcludedEntityTypeFamilyTargets', excludedFamilies.set)
        .implement(SERVER, 'AimAssistPresetSettings', 'getLiquidTargetingItems', liquid.get)
        .implement(SERVER, 'AimAssistPresetSettings', 'setLiquidTargetingItems', liquid.set)
        .implement(SERVER, 'AimAssistPresetSettings', 'getItemSettings', (call) =>
            JSON.stringify(presetSettingsOf(call.state).itemSettings)
        )
        .implement(SERVER, 'AimAssistPresetSettings', 'setItemSettings', (call) => {
            updatePreset(call, { itemSettings: texts(recordArgument(call)) });
            return undefined;
        });
};
