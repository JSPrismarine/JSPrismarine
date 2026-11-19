/**
 * A player's `fogSettings`: the stack of fog definitions their client draws, each layer tagged
 * by the script that pushed it. A `FogSettings` object's state is its player's entity key, as
 * `Player.fogSettings` makes it. `pop` takes the topmost layer of a tag, or of any tag when none
 * is given, and `remove` every layer of a tag, as `/fog pop` and `/fog remove` do.
 */
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { PackHost } from '../minecraftServer';
import { entityKeyOf, invalidEntity, SERVER } from '../serverObjects';
import type { ScriptFogLayer } from './seam';
import { worldSystemOf } from './serverWorld';

/** The tag a layer gets when a script gives none. */
const NO_TAG = '';

/**
 * Registers the fog settings members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementFog = (implementations: ScriptApiImplementations, host: Pick<PackHost, 'world'>): void => {
    const system = () => worldSystemOf(host);
    /** The player's id and stack, or BDS's error for a player who is gone. */
    const stackOf = (call: ScriptCall, member: string): { player: string; layers: readonly ScriptFogLayer[] } => {
        const key = entityKeyOf(call.state);
        const layers = system().fogStack(key.id);
        if (layers === undefined) throw invalidEntity('call', member, key);
        return { player: key.id, layers };
    };
    const tagOf = (call: ScriptCall, index: number): string | undefined => {
        const tag = call.args[index];
        return typeof tag === 'string' ? tag : undefined;
    };
    /** A list argument of strings, as plain data. */
    const stringsOf = (call: ScriptCall, index: number): string[] => {
        const json = call.stringify(call.args[index] ?? null);
        // The engine wrote the string with JSON.stringify; the binding checked it is a string array.
        const parsed: unknown = json === undefined ? [] : JSON.parse(json);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    };

    implementations
        .implement(SERVER, 'FogSettings', 'getStack', (call) =>
            JSON.stringify(stackOf(call, 'getStack').layers.map((layer) => layer.fogId))
        )
        .implement(SERVER, 'FogSettings', 'getTags', (call) =>
            JSON.stringify(stackOf(call, 'getTags').layers.map((layer) => layer.tag))
        )
        .implement(SERVER, 'FogSettings', 'push', (call) => {
            const { player, layers } = stackOf(call, 'push');
            const next = [...layers, { fogId: String(call.args[0]), tag: tagOf(call, 1) ?? NO_TAG }];
            system().setFogStack(player, next);
            return next.length - 1;
        })
        .implement(SERVER, 'FogSettings', 'pop', (call) => {
            const { player, layers } = stackOf(call, 'pop');
            const tag = tagOf(call, 0);
            const at = layers.findLastIndex((layer) => tag === undefined || layer.tag === tag);
            if (at < 0) return undefined;
            system().setFogStack(player, [...layers.slice(0, at), ...layers.slice(at + 1)]);
            return layers[at]?.fogId;
        })
        .implement(SERVER, 'FogSettings', 'remove', (call) => {
            const { player, layers } = stackOf(call, 'remove');
            const tag = tagOf(call, 0) ?? NO_TAG;
            const kept = layers.filter((layer) => layer.tag !== tag);
            if (kept.length === layers.length) return false;
            system().setFogStack(player, kept);
            return true;
        })
        .implement(SERVER, 'FogSettings', 'setStack', (call) => {
            const { player, layers } = stackOf(call, 'setStack');
            const tag = tagOf(call, 1) ?? NO_TAG;
            // The tag's layers are replaced by the new ones, on top of the other tags' layers.
            system().setFogStack(player, [
                ...layers.filter((layer) => layer.tag !== tag),
                ...stringsOf(call, 0).map((fogId) => ({ fogId, tag }))
            ]);
            return undefined;
        });
};
