/**
 * Which actor types a session's release can draw
 * ([ADR 0025](../../../../../docs/adr/0025-older-protocols-are-a-window-relative-to-the-newest-release.md)).
 *
 * Each release's captured `AvailableActorIdentifiersPacket` lists the vanilla types its client
 * renders. 1.26.60 added `minecraft:ice_ball`, so a 1.26.51 session is not shown one: there is
 * no type to draw it as. A pack's own actor is in no capture and is shown as before.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { entity_identifiers as entity_identifiers_2193 } from '@jsprismarine/bedrock-data/v2193';
import { entity_identifiers as entity_identifiers_2225 } from '@jsprismarine/bedrock-data/v2225';
import { entity_identifiers as entity_identifiers_2259 } from '@jsprismarine/bedrock-data/v2259';
import { ByteOrder, NBTReader, NBTTagCompound } from '@jsprismarine/nbt';
import type { ProtocolContext } from '@jsprismarine/protocol';

const namesByCapture = new WeakMap<Buffer, ReadonlySet<string>>();

/** The type names one captured actor list holds: a network NBT compound with an `idlist`. */
const namesOf = (capture: Buffer): ReadonlySet<string> => {
    let names = namesByCapture.get(capture);
    if (names === undefined) {
        const reader = new NBTReader(new BinaryStream(capture), ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(true);
        const idlist = reader.parse().getList('idlist', false) ?? [];
        names = new Set(
            [...idlist].flatMap((entry) => (entry instanceof NBTTagCompound ? [entry.getString('id', '')] : []))
        );
        namesByCapture.set(capture, names);
    }
    return names;
};

let vanilla: ReadonlySet<string> | undefined;

/** Every type any captured release lists: what makes an actor type vanilla. */
const vanillaActorTypes = (): ReadonlySet<string> =>
    (vanilla ??= new Set(
        [entity_identifiers_2193, entity_identifiers_2225, entity_identifiers_2259].flatMap((capture) => [
            ...namesOf(capture)
        ])
    ));

/**
 * Whether a session's release lacks a vanilla actor type another release has.
 * @param context - The session codec's context, whose actor list the client was sent.
 * @param identifier - The actor's type.
 * @returns True when the session should not be shown the actor.
 */
export const isMissingVanillaActor = (context: ProtocolContext, identifier: string): boolean =>
    context.entityIdentifiers !== undefined &&
    !namesOf(context.entityIdentifiers).has(identifier) &&
    vanillaActorTypes().has(identifier);
