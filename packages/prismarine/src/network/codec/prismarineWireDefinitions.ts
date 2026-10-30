/**
 * The declarative packet definitions that live in this package, keyed by packet name.
 *
 * A definition belongs in `@jsprismarine/protocol`'s `wireDefinitions` once its field types
 * are all protocol-package vocabulary. The ones here lean on prismarine-owned structures
 * (`Item`, `Skin`, `Metadata`, ...) wrapped as custom wire types, so they live beside their
 * classes for now and move to the protocol registry when those structures do. The parity
 * round-trip suite consults both registries, so these packets are held to the same captured
 * server bytes either way.
 */
import { addActorPacket } from '@jsprismarine/protocol/wire/definitions/addActor';
import { addPlayerPacket } from '../packet/addPlayer.wire';
import { gameRulesChangedPacket } from '@jsprismarine/protocol/wire/definitions/gameRulesChanged';
import { inventoryTransactionPacket } from '../packet/inventoryTransaction.wire';
import { playerListPacket } from '@jsprismarine/protocol/wire/definitions/playerList';
import { playerSkinPacket } from '@jsprismarine/protocol/wire/definitions/playerSkin';
import { setActorDataPacket } from '@jsprismarine/protocol/wire/definitions/setActorData';
import { updateAttributesPacket } from '@jsprismarine/protocol/wire/definitions/updateAttributes';

import type { PacketDefinition } from '@jsprismarine/protocol';

/** The prismarine-side declaratively defined packets, keyed by packet name. */
export const prismarineWireDefinitions: ReadonlyMap<string, PacketDefinition> = new Map(
    [
        addActorPacket,
        addPlayerPacket,
        gameRulesChangedPacket,
        inventoryTransactionPacket,
        playerListPacket,
        playerSkinPacket,
        setActorDataPacket,
        updateAttributesPacket
    ].map((definition) => [definition.name, definition])
);
