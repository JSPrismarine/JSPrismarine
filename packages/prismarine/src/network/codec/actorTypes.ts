/**
 * Which actor types a session's release can draw
 * ([ADR 0025](../../../../../docs/adr/0025-older-protocols-are-a-window-relative-to-the-newest-release.md)).
 *
 * Each release's captured `AvailableActorIdentifiersPacket` lists the vanilla types its client
 * renders. 1.26.60 added `minecraft:ice_ball`, so a 1.26.51 session is not shown one: there is
 * no type to draw it as. A pack's own actor is in no capture, so {@link withPackActorTypes} adds
 * it to the list the session is sent.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { entity_identifiers } from '@jsprismarine/bedrock-data';
import { entity_identifiers as entity_identifiers_2193 } from '@jsprismarine/bedrock-data/v2193';
import { entity_identifiers as entity_identifiers_2225 } from '@jsprismarine/bedrock-data/v2225';
import { entity_identifiers as entity_identifiers_2259 } from '@jsprismarine/bedrock-data/v2259';
import { ByteOrder, NBTReader, NBTTagCompound, Types } from '@jsprismarine/nbt';
import type { ProtocolContext } from '@jsprismarine/protocol';

import { nbtBytesOf, nbtOfBytes } from '../../nbtBytes';

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

/**
 * The actor types the newest release lists and a session's release does not: what a world on
 * the newest release can hold that the session cannot draw.
 * @param context - The session codec's context.
 * @returns The types, sorted.
 */
export const missingVanillaActors = (context: ProtocolContext): string[] =>
    [...namesOf(entity_identifiers)].filter((identifier) => isMissingVanillaActor(context, identifier)).sort();

/** An actor type a behavior pack declares, as the actor list describes it. */
export interface PackActorType {
    readonly identifier: string;
    /** The file's `runtime_identifier`: the vanilla type it takes its engine mechanics from. */
    readonly runtimeIdentifier?: string;
    /** The file's `is_spawnable`. */
    readonly isSpawnable: boolean;
    /** The file's `is_summonable`. */
    readonly isSummonable: boolean;
}

/**
 * A captured actor list with an entry for each pack type it lacks, as protocol 2225's pinned BDS
 * lists them.
 *
 * The client creates no actor whose type the list leaves out, so a pack's actor missing from it
 * is never drawn, with no error on either side. BDS writes a pack type as `bid` (its
 * `runtime_identifier`, or `minecraft:` without one), `hasspawnegg` (`is_spawnable`), `id`, `rid`
 * and `summonable` (`is_summonable`). It numbers every type without a legacy id from 257 in its
 * hash map's order, the player among them; this keeps the captured entries as they are and
 * numbers the pack's types after the highest `rid`, in name order, so the list is the same on
 * every run. A vanilla type of another release is left out: the session's client cannot draw it.
 *
 * @param capture - The session's captured list: a network NBT compound with an `idlist`.
 * @param types - The pack types, in any order.
 * @returns The capture itself when it already lists every type.
 */
export const withPackActorTypes = (capture: Buffer, types: Iterable<PackActorType>): Buffer => {
    const listed = namesOf(capture);
    const added = [...types]
        .filter((type) => !listed.has(type.identifier) && !vanillaActorTypes().has(type.identifier))
        .sort((left, right) => (left.identifier < right.identifier ? -1 : left.identifier > right.identifier ? 1 : 0));
    if (added.length === 0) return capture;

    const root = nbtOfBytes(capture);
    const idlist = root.getList('idlist', false);
    if (idlist === null) return capture;
    let rid = Math.max(
        0,
        ...[...idlist].flatMap((entry) => (entry instanceof NBTTagCompound ? [entry.getNumber('rid', 0)] : []))
    );
    for (const type of added) {
        const entry = new NBTTagCompound();
        entry.addValue('bid', new Types.StringVal(type.runtimeIdentifier ?? 'minecraft:'));
        entry.addValue('hasspawnegg', new Types.ByteVal(type.isSpawnable ? 1 : 0));
        entry.addValue('id', new Types.StringVal(type.identifier));
        entry.addValue('rid', new Types.NumberVal((rid += 1)));
        entry.addValue('summonable', new Types.ByteVal(type.isSummonable ? 1 : 0));
        idlist.add(entry);
    }
    return Buffer.from(nbtBytesOf(root));
};
