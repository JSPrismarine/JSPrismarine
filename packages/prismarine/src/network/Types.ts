import { TextPacketType } from '@jsprismarine/protocol';

/**
 * Compatibility home for `Protocol.Types.TextPacketType`, which `@jsprismarine/prismarine`
 * exposes through its `Protocol` namespace. Nothing in the repository imports this module;
 * the other enums it once re-exported now live only under `./type/`. New code should import
 * `TextPacketType` from `@jsprismarine/protocol`. Removing this module, and with it the
 * `Protocol.Types` namespace, is a public API change that needs a minor bump.
 */
export { TextPacketType };
