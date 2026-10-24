import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/** The fields of an `EduSharedUriResource`, in wire order. */
export interface EduSharedUriResourceData {
    /** `Button Name`, the label of the button the Education Edition client shows. */
    buttonName: string;
    /** `Link Uri`, the address the button opens. */
    linkUri: string;
}

/**
 * The link an Education Edition world offers its players, as `EduUriResourcePacket` and
 * `LevelSettings` (inside `StartGamePacket`) carry it.
 *
 * Protocol 2193 wire order: `Button Name` then `Link Uri`, both strings (a varuint32 byte
 * length followed by UTF-8). Both are empty when the world shares no link.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/edu-shared-uri-resource/}
 */
export default class EduSharedUriResource extends NetworkStructure implements EduSharedUriResourceData {
    public constructor(
        public buttonName = '',
        public linkUri = ''
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.buttonName);
        stream.writeString(this.linkUri);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.buttonName = stream.readString();
        this.linkUri = stream.readString();
    }
}
