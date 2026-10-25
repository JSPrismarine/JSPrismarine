/**
 * Java enchantment ids against the numbers a Bedrock client knows them by.
 *
 * `PlayerEnchantOptionsPacket` carries an `EnchantType` as a uint8, so an
 * offer the client can draw needs the number and not the id. The table is
 * derived from the `EnchantType` enum rather than written out beside it:
 * every member's name snake-cased is its Java id, except the two curses,
 * which Java spells the other way round (`binding_curse`, not
 * `curse_of_binding`).
 *
 * A Java id with no entry is one the client's own registry does not list -
 * `sweeping_edge`, and every enchantment a datapack adds. There is no packet
 * that teaches a Bedrock client a new one, so an offer involving one cannot
 * be drawn; see `projectToBedrock` in `@jsprismarine/enchantments` for what
 * the client gets instead. The mechanics still run either way.
 */
import { EnchantType } from '../network/packet/PlayerEnchantOptionsPacket';

/** The two Bedrock names Java does not spell the same way round. */
const RENAMED: Readonly<Record<string, string>> = {
    CurseOfBinding: 'minecraft:binding_curse',
    CurseOfVanishing: 'minecraft:vanishing_curse'
};

const snakeCase = (name: string): string =>
    name
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();

const byJavaId = new Map<string, EnchantType>(
    Object.entries(EnchantType).flatMap(([name, value]) =>
        typeof value === 'number' ? [[RENAMED[name] ?? `minecraft:${snakeCase(name)}`, value] as const] : []
    )
);

/**
 * The number a Bedrock client knows one Java enchantment by.
 *
 * @returns Undefined when the client has no such enchantment, which is the
 *   honest answer: there is nothing to send.
 */
export const bedrockEnchantType = (javaId: string): EnchantType | undefined => byJavaId.get(javaId);

/** The same table read backwards, so a stored Bedrock number resolves to a Java id. */
const byEnchantType = new Map<EnchantType, string>();
for (const [javaId, type] of byJavaId) if (!byEnchantType.has(type)) byEnchantType.set(type, javaId);

/**
 * The Java enchantment one Bedrock number names.
 *
 * The inverse of {@link bedrockEnchantType}, which is what reading a stored `ench` list needs:
 * a world written by the game itself carries the numbers and nothing else.
 *
 * @returns Undefined for a number no `EnchantType` member has, which a world written by a
 *   newer client may carry.
 */
export const javaEnchantmentId = (type: number): string | undefined => byEnchantType.get(type);
