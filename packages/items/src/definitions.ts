import type { Definition } from '@jsprismarine/content';

import { ITEM_REGISTRY_NAME } from './itemTypes';

/**
 * Builds one item definition from a plain component map, which is the shape
 * the generated table and Mojang's own default component report both use.
 *
 * @param identifier - The Bedrock item identifier the type registers under.
 * @param components - Component name to raw value, in the order they bind.
 * @param pack - The pack name diagnostics report, `overlay` by default.
 */
export const itemDefinition = (
    identifier: string,
    components: Record<string, unknown>,
    pack = 'overlay'
): Definition => ({
    identifier,
    registry: ITEM_REGISTRY_NAME,
    pack,
    path: `items/${identifier.replace(':', '_')}.json`,
    data: { java: identifier, components }
});
