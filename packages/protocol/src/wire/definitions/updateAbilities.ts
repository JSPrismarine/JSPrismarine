/**
 * `UpdateAbilitiesPacket` described as a declarative field list; layout unchanged between
 * protocols 2193 and 2225. The payload is one "SerializedAbilitiesData".
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-abilities-packet/}
 */
import SerializedAbilityLayer from '../../structure/SerializedAbilityLayer';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

/** One ability layer, bridged from the hand-written `SerializedAbilityLayer`. */
const abilityLayer = t.custom<SerializedAbilityLayer>(
    'SerializedAbilitiesDataSerializedLayer',
    (s, v) => v.serialize(s),
    (s) => {
        const layer = new SerializedAbilityLayer(0, 0, 0, 0, 0, 0);
        layer.deserialize(s);
        return layer;
    }
);

/**
 * The `UpdateAbilitiesPacket` field list. The docs type "Player Permissions" as
 * `PlayerPermissionLevel` and "Command Permissions" as `CommandPermissionLevel`, the generated
 * enums in `@jsprismarine/minecraft`.
 */
export const updateAbilitiesPacket = definePacket('UpdateAbilitiesPacket', {
    /** "Target Player Raw Id": the actor unique id the client got in `StartGamePacket`. */
    targetActorUniqueId: t.li64,
    /** "Player Permissions". */
    playerPermission: t.int8,
    /** "Command Permissions". */
    commandPermission: t.uint8,
    /** "Layers": the client merges them in order, so a later layer's flag wins. */
    abilityLayers: t.list(abilityLayer)
});
