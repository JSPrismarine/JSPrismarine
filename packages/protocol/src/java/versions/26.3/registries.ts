/** Java Edition 26.3's static registries, from its server jar's registries report. */
import { JavaRegistry } from '../javaRegistry';
import registries from './registries.json' with { type: 'json' };

/** Entity types, which `Spawn Entity` names by id. */
export const ENTITY_TYPES = new JavaRegistry(registries.entity_type);

/** Items, which a slot names by id. */
export const ITEMS = new JavaRegistry(registries.item);
