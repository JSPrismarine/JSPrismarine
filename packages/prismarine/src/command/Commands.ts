/**
 * The command classes this server still registers itself.
 *
 * Everything vanilla now comes from `@jsprismarine/commands` through
 * {@link import('./vanillaCommands').buildVanillaCommands}; what is left here
 * is the `jsprismarine:` namespace and the two vanilla commands that package
 * does not implement, `/ban` and `/pardon`, which Bedrock has no counterpart
 * for and Java keeps outside the shared set.
 */
import DebugCommand from './jsprismarine/DebugCommand';
import TpsCommand from './jsprismarine/TpsCommand';
import VersionCommand from './jsprismarine/VersionCommand';
import BanCommand from './vanilla/BanCommand';
import PardonCommand from './vanilla/PardonCommand';

export { BanCommand, DebugCommand, PardonCommand, TpsCommand, VersionCommand };
