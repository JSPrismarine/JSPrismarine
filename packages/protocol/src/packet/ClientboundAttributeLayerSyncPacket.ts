import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import AttributeLayerData from '../structure/AttributeLayerData';
import AttributeLayerData2225 from '../structure/AttributeLayerData2225';
import EnvironmentAttributeData from '../structure/EnvironmentAttributeData';
import EnvironmentAttributeData2225, { AttributePayloadType } from '../structure/EnvironmentAttributeData2225';
import { AttributeDataType } from '../structure/EnvironmentAttributeData';
import { protocolVersion as protocol2259 } from '../wire/versions/v2259';
import {
    AttributeLayerSyncDataType,
    clientboundAttributeLayerSyncPacket
} from '../wire/definitions/clientboundAttributeLayerSync';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { AttributeValue } from '../structure/EnvironmentAttributeData';
import type {
    AttributeLayerSyncData,
    AttributeLayerSyncData2225
} from '../wire/definitions/clientboundAttributeLayerSync';
import { ProtocolCodecErrors } from '@jsprismarine/errors/protocol/codec';

export { AttributeLayerSyncDataType };
export type { AttributeLayerSyncData, AttributeLayerSyncData2225 };

/** The fields of a `ClientboundAttributeLayerSyncPacket`, in wire order. */
export interface ClientboundAttributeLayerSync {
    /**
     * `Data`, the one alternative this packet carries. Build its layers and attributes from the
     * structures of the protocol the packet is sent at: `AttributeLayerData` and
     * `EnvironmentAttributeData` up to 2193, `AttributeLayerData2225` and
     * `EnvironmentAttributeData2225` from 2225.
     */
    data: AttributeLayerSyncData | AttributeLayerSyncData2225;
}

/**
 * Whether the data's layers and attributes are the 2193 structures. The alternatives that carry
 * neither, and empty lists, read the same at both layouts, so they satisfy this and
 * {@link isData2225} alike.
 */
const isData2193 = (data: ClientboundAttributeLayerSync['data']): data is AttributeLayerSyncData => {
    switch (data.type) {
        case AttributeLayerSyncDataType.UpdateAttributeLayers:
            return data.attributeLayers.every((layer) => layer instanceof AttributeLayerData);
        case AttributeLayerSyncDataType.UpdateEnvironmentAttributes:
            return data.attributes.every((attribute) => attribute instanceof EnvironmentAttributeData);
        default:
            return true;
    }
};

/** Whether the data's layers and attributes are the 2225 structures; see {@link isData2193}. */
const isData2225 = (data: ClientboundAttributeLayerSync['data']): data is AttributeLayerSyncData2225 => {
    switch (data.type) {
        case AttributeLayerSyncDataType.UpdateAttributeLayers:
            return data.attributeLayers.every((layer) => layer instanceof AttributeLayerData2225);
        case AttributeLayerSyncDataType.UpdateEnvironmentAttributes:
            return data.attributes.every((attribute) => attribute instanceof EnvironmentAttributeData2225);
        default:
            return true;
    }
};

/** Every attribute value a `Data` variant carries, in either layout. */
const attributeValuesOf = (data: ClientboundAttributeLayerSync['data']): AttributeValue[] => {
    const environment: ReadonlyArray<EnvironmentAttributeData | EnvironmentAttributeData2225> =
        data.type === AttributeLayerSyncDataType.UpdateAttributeLayers
            ? data.attributeLayers.flatMap(
                  (layer): ReadonlyArray<EnvironmentAttributeData | EnvironmentAttributeData2225> => layer.attributes
              )
            : data.type === AttributeLayerSyncDataType.UpdateEnvironmentAttributes
              ? data.attributes
              : [];
    return environment.flatMap((attribute) => {
        if (attribute instanceof EnvironmentAttributeData) {
            return [attribute.fromAttribute, attribute.attribute, attribute.toAttribute].filter(
                (value) => value !== undefined
            );
        }
        const { payload } = attribute;
        return payload.type === AttributePayloadType.Constant
            ? [payload.attribute]
            : [payload.fromAttribute, payload.toAttribute];
    });
};

/**
 * Syncs the server's environment attribute layers (fog, lighting and similar per-dimension
 * attributes blended by priority and weight) to the client.
 *
 * Protocol 2193 layout, in wire order: `Data` as a Cereal tagged variant, a varuint32
 * selector (the {@link AttributeLayerSyncDataType} value) followed by the alternative's
 * fields. Every list is a varuint32 count then its items. `UpdateAttributeLayersData` is
 * `Attribute Layers`, a list of {@link AttributeLayerData}. The other three alternatives
 * open with `Attribute Layer Name` (string) and `Attribute Layer Dimension` (ZigZag
 * varint32), then `UpdateAttributeLayerSettingsData` continues with `Attributes Layer
 * Settings` as an {@link AttributeLayerSettings}, `UpdateEnvironmentAttributesData` with
 * `Attributes` as a list of {@link EnvironmentAttributeData}, and
 * `RemoveEnvironmentAttributesData` with `Attributes` as a list of strings.
 *
 * Protocol 2225 keeps the selector, the three other alternatives and `AttributeLayerSettings`,
 * and reworks the two structures: `AttributeLayerData` drops `NoiseName` and lists
 * {@link AttributeLayerData2225} and {@link EnvironmentAttributeData2225}, whose attributes
 * carry a `Payload` variant in place of the 2193 transition fields.
 *
 * Mojang merged four earlier drafts (`ClientboundAttributeLayerPacket`,
 * `ClientboundAttributeLayerSettingsPacket`, `ClientboundEnvironmentAttributeUpdatePacket`
 * and `ClientboundEnvironmentAttributeRemovePacket`) into this one variant. The docs mark the
 * packet "Currently disabled", so no release client has been seen to handle it. The wire layout
 * lives in `clientboundAttributeLayerSync.ts`'s declarative definition, which this class walks
 * at the protocol version stamped on it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-attribute-layer-sync-packet/
 * @throws when the payload carries the structures of the other protocol layout than the one stamped on the packet.
 */
export default class ClientboundAttributeLayerSyncPacket extends NetworkPacket<ClientboundAttributeLayerSync> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_ATTRIBUTE_LAYER_SYNC;
    }

    protected serializePayload(stream: NetworkBinaryStream, { data }: ClientboundAttributeLayerSync): void {
        if (
            this.codecProtocol < protocol2259 &&
            attributeValuesOf(data).some((value) => value.type === AttributeDataType.String)
        ) {
            throw new ProtocolCodecErrors.StringAttributeUnsupported({
                protocol2259,
                codecProtocol: this.codecProtocol
            });
        }
        // The layout writes whichever of the two gated fields the stamped version admits; the other one is ignored.
        layoutAt(clientboundAttributeLayerSyncPacket, this.codecProtocol).encode(stream, {
            dataUntil2225: isData2193(data) ? data : null,
            dataSince2225: isData2225(data) ? data : null
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundAttributeLayerSync {
        const { dataUntil2225, dataSince2225 } = layoutAt(
            clientboundAttributeLayerSyncPacket,
            this.codecProtocol
        ).decode(stream);

        // The gated field the version leaves off the wire decodes as its `null` fallback.
        const data = dataUntil2225 ?? dataSince2225;
        if (data === null) throw new ProtocolCodecErrors.AttributeLayerDataNotDecoded();
        return { data };
    }
}
