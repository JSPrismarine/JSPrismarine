/**
 * Every Java Edition packet this package defines, read off the modules that define them, so a new
 * definition joins the list without an edit here.
 */
import * as levelChunk from '../chunk/levelChunk';
import type { JavaProtocol } from '../versions/javaRelease';
import * as configuration from './configuration';
import * as handshake from './handshake';
import type { JavaPacketDefinition, JavaPhase } from './JavaPacket';
import { javaPacketId } from './JavaPacket';
import type { PacketBound } from '../../wire/define';
import * as login from './login';
import * as play from './play';
import * as status from './status';

/**
 * Whether a module export is a packet definition rather than a constant, an enum or a helper.
 * @param value - The export.
 * @returns True for a definition {@link defineJavaPacket} made.
 */
export const isJavaPacketDefinition = (value: unknown): value is JavaPacketDefinition =>
    typeof value === 'object' &&
    value !== null &&
    'key' in value &&
    'phase' in value &&
    'bound' in value &&
    'fields' in value;

/** Every packet definition, phase by phase, in the order its module declares it. */
export const JAVA_PACKETS: readonly JavaPacketDefinition[] = [handshake, status, login, configuration, play, levelChunk]
    .flatMap((module) => Object.values(module))
    .filter(isJavaPacketDefinition);

/**
 * The definitions one side reads in a phase, by their id in a release. Most ids have one
 * definition; an id two definitions share, such as `Player Info Update` with its action sets, lists
 * both, and the reader tells them apart by what the packet carries.
 * @param protocol - The release the connection speaks.
 * @param phase - The phase.
 * @param bound - The direction the packets travel.
 * @returns The definitions, by id.
 */
export const javaPacketsById = (
    protocol: JavaProtocol,
    phase: JavaPhase,
    bound: PacketBound
): ReadonlyMap<number, readonly JavaPacketDefinition[]> => {
    const byId = new Map<number, JavaPacketDefinition[]>();
    for (const definition of JAVA_PACKETS) {
        if (definition.phase !== phase || definition.bound !== bound) continue;
        const id = javaPacketId(protocol, definition);
        byId.set(id, [...(byId.get(id) ?? []), definition]);
    }
    return byId;
};
