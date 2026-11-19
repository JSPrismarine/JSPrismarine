/**
 * The `@minecraft/server` members of the type registries: `BlockTypes`, `BlockStates`,
 * `ItemTypes`, `EnchantmentTypes` and `Potions`, and the type objects they hand out.
 *
 * Every answer comes from the world's {@link ScriptCatalog}, which a server builds from what the
 * pinned Bedrock Dedicated Server's Script API reported. A world without a catalog knows only the
 * types it resolves, and its registries list none. The edge cases follow the `type-registries`
 * scenario recorded on BDS.
 */
import { ScriptApiError } from '../../errors';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { itemState, SERVER, TAG, withNamespace } from '../serverObjects';
import type { ScriptCatalog } from '../world';
import { keptArray } from './handles';
import { BLOCK_ITEM_TAG } from './tags';

/** The id of a type argument, which a script gives as the type's object or as its id. */
export const typeArgument = (call: ScriptCall, value: unknown): string =>
    value instanceof ScriptHandle ? call.stateOf(value) : String(value);

/** An enchantment's id as the Script API writes it: without `minecraft:`. */
export const enchantmentId = (id: string): string => (id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id);

/**
 * Registers the registry members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementTypes = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const catalog = (): ScriptCatalog | undefined => world.catalog;
    // BDS hands out one object for each type, so a script can compare two with `===`.
    const blockType = (id: string): ScriptHandle => host.instance('BlockType', TAG.blockType, id);
    const itemType = (id: string): ScriptHandle => host.instance('ItemType', TAG.itemType, id);
    const enchantmentType = (id: string): ScriptHandle =>
        host.instance('EnchantmentType', BLOCK_ITEM_TAG.enchantmentType, id);
    const effectType = (id: string): ScriptHandle =>
        host.instance('PotionEffectType', BLOCK_ITEM_TAG.potionEffectType, id);
    const deliveryType = (id: string): ScriptHandle =>
        host.instance('PotionDeliveryType', BLOCK_ITEM_TAG.potionDeliveryType, id);
    const stateType = (id: string): ScriptHandle => host.instance('BlockStateType', BLOCK_ITEM_TAG.blockStateType, id);
    const knownBlock = (id: string): boolean =>
        catalog()?.blockType(id) !== undefined || world.resolveBlock(id, {}) !== undefined;
    const knownItem = (id: string): boolean =>
        catalog()?.itemType(id) !== undefined || world.itemType(id) !== undefined;
    const enchantment = (id: string) =>
        catalog()
            ?.enchantments()
            .find((each) => each.id === enchantmentId(id));
    // A potion effect's id needs its namespace, and a delivery's its case, as BDS reads them.
    const effect = (id: string) =>
        catalog()
            ?.potionEffects()
            .find((each) => each.effect === id);
    const delivery = (id: string) =>
        catalog()
            ?.potionDeliveries()
            .find((each) => each === id);

    implementations
        .implement(SERVER, 'BlockTypes', 'get', (call) => {
            const id = withNamespace(String(call.args[0]));
            return knownBlock(id) ? blockType(id) : undefined;
        })
        .implement(SERVER, 'BlockTypes', 'getAll', () =>
            keptArray(host, (catalog()?.blockTypes() ?? []).map(blockType))
        )
        .implement(SERVER, 'BlockType', 'localizationKey', {
            get: (call) => catalog()?.blockType(call.state)?.localizationKey ?? ''
        })
        .implement(SERVER, 'BlockStates', 'get', (call) => {
            const name = String(call.args[0]);
            const found = catalog()
                ?.blockStates()
                .find((state) => state.id === name);
            return found === undefined ? undefined : stateType(found.id);
        })
        .implement(SERVER, 'BlockStates', 'getAll', () =>
            keptArray(
                host,
                (catalog()?.blockStates() ?? []).map((state) => stateType(state.id))
            )
        )
        .implement(SERVER, 'BlockStateType', 'id', { get: (call) => call.state })
        .implement(SERVER, 'BlockStateType', 'validValues', {
            get: (call) =>
                JSON.stringify(
                    catalog()
                        ?.blockStates()
                        .find((state) => state.id === call.state)?.validValues ?? []
                )
        })
        .implement(SERVER, 'ItemTypes', 'get', (call) => {
            const id = withNamespace(String(call.args[0]));
            return knownItem(id) ? itemType(id) : undefined;
        })
        .implement(SERVER, 'ItemTypes', 'getAll', () => keptArray(host, (catalog()?.itemTypes() ?? []).map(itemType)))
        .implement(SERVER, 'ItemType', 'localizationKey', {
            get: (call) => catalog()?.itemType(call.state)?.localizationKey ?? ''
        })
        .implement(SERVER, 'EnchantmentTypes', 'get', (call) => {
            const found = enchantment(String(call.args[0]));
            return found === undefined ? undefined : enchantmentType(found.id);
        })
        .implement(SERVER, 'EnchantmentTypes', 'getAll', () =>
            keptArray(
                host,
                (catalog()?.enchantments() ?? []).map((each) => enchantmentType(each.id))
            )
        )
        .implement(SERVER, 'EnchantmentType', 'constructor', (call) => {
            const id = String(call.args[0]);
            const found = enchantment(id);
            if (found === undefined) throw new ScriptApiError(SERVER, 'Error', 'Unknown enchantment type ID.');
            return found.id;
        })
        .implement(SERVER, 'EnchantmentType', 'id', { get: (call) => call.state })
        .implement(SERVER, 'EnchantmentType', 'maxLevel', { get: (call) => enchantment(call.state)?.maxLevel ?? 0 })
        .implement(SERVER, 'Potions', 'getAllEffectTypes', () =>
            keptArray(
                host,
                (catalog()?.potionEffects() ?? []).map((each) => effectType(each.effect))
            )
        )
        .implement(SERVER, 'Potions', 'getAllDeliveryTypes', () =>
            keptArray(host, (catalog()?.potionDeliveries() ?? []).map(deliveryType))
        )
        .implement(SERVER, 'Potions', 'getEffectType', (call) => {
            const found = effect(String(call.args[0]));
            return found === undefined ? undefined : effectType(found.effect);
        })
        .implement(SERVER, 'Potions', 'getDeliveryType', (call) => {
            const found = delivery(String(call.args[0]));
            return found === undefined ? undefined : deliveryType(found);
        })
        .implement(SERVER, 'Potions', 'resolve', (call) => {
            const effectId = typeArgument(call, call.args[0]);
            const deliveryId = typeArgument(call, call.args[1]);
            const found = effect(effectId);
            const unknownEffect = () =>
                new ScriptApiError(
                    SERVER,
                    'InvalidPotionEffectTypeError',
                    `PotionEffectType <${effectId}> does not exist. Prefer to use MinecraftPotionEffectTypes enum.`
                );
            if (found === undefined) throw unknownEffect();
            const how = delivery(deliveryId);
            if (how === undefined) {
                throw new ScriptApiError(
                    SERVER,
                    'InvalidPotionDeliveryTypeError',
                    `PotionDeliveryType <${deliveryId}> does not exist. Prefer to use MinecraftPotionDeliveryTypes enum.`
                );
            }
            const item = catalog()?.potionItem(found.effect, how);
            if (item === undefined) throw unknownEffect();
            const state = itemState({
                typeId: item.typeId,
                amount: 1,
                ...(item.data === 0 ? {} : { data: item.data })
            });
            return host.engine.release(host.create('ItemStack', TAG.itemStack, state));
        })
        .implement(SERVER, 'PotionEffectType', 'id', { get: (call) => call.state })
        .implement(SERVER, 'PotionEffectType', 'durationTicks', {
            get: (call) => effect(call.state)?.durationTicks ?? undefined
        })
        .implement(SERVER, 'PotionDeliveryType', 'id', { get: (call) => call.state });
};
