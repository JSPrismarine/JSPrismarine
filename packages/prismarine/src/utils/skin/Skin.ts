import type BinaryStream from '@jsprismarine/binaryutils';
import { NetworkUtil } from '../../network/NetworkUtil';
import UUID from '../UUID';
import SkinAnimation from './SkinAnimation';
import SkinCape from './SkinCape';
import SkinImage from './SkinImage';
import SkinPersona from './skin-persona/SkinPersona';
import SkinPersonaPiece from './skin-persona/SkinPersonaPiece';
import SkinPersonaPieceTintColor from './skin-persona/SkinPersonaPieceTintColor';

interface Image {
    ImageWidth: number;
    ImageHeight: number;
    Image: string;
}

interface AnimatedImageData extends Image {
    Frames: number;
    Type: number;
    AnimationExpression: number;
}

interface PersonaPiece {
    IsDefault: boolean;
    PackId: string;
    PieceId: string;
    PieceType: string;
    ProductId: string;
}

interface PieceTintColor {
    Colors: string[];
    PieceType: string;
}

interface JWT {
    SkinId: string;
    CapeId: string;
    SkinResourcePatch: string;
    PlayFabId: string;
    SkinImageHeight: number;
    SkinImageWidth: number;
    SkinGeometryData: string;
    SkinAnimationData: string;
    CapeImageHeight: number;
    CapeImageWidth: number;
    CapeOnClassicSkin: boolean;
    SkinData: string;
    CapeData: string;
    PremiumSkin: boolean;
    PersonaSkin: boolean;
    SkinColor: string;
    ArmSize: string;
    AnimatedImageData: AnimatedImageData[];
    PersonaPieces: PersonaPiece[];
    PieceTintColors: PieceTintColor[];
}

/**
 * A string field of the client data, or empty when the client did not send one.
 *
 * Every one of these is optional in practice: a client omits what does not apply to it, and
 * `PlayFabId` is absent for anyone the marketplace has never seen. Absent is not a broken skin
 * - it is an empty string - but reading it as one crashed the *player list*, which is built
 * from every player's skin, so one client without a PlayFab id took the list down for everyone.
 */
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The same, for the fields that arrive base64 encoded. */
const decode = (value: unknown): string => Buffer.from(text(value), 'base64').toString();

/**
 * The persona piece types protocol 2193 numbers, in wire order. The index is the id.
 *
 * From gophertunnel's `protocol/skin.go` (`PieceTypeUnknown` through `PieceTypeUnsupported`).
 * A piece type the client data names and this list does not is sent as `unknown`.
 */
const PIECE_TYPES = [
    'unknown',
    'skeleton',
    'body',
    'skin',
    'bottom',
    'feet',
    'dress',
    'top',
    'high_pants',
    'hands',
    'outerwear',
    'facial_hair',
    'mouth',
    'eyes',
    'hair',
    'hood',
    'back',
    'face_accessory',
    'head',
    'legs',
    'left_leg',
    'right_leg',
    'arms',
    'left_arm',
    'right_arm',
    'capes',
    'classic_skin',
    'emote',
    'unsupported'
] as const;

const PIECE_TYPE_IDS: ReadonlyMap<string, number> = new Map(PIECE_TYPES.map((name, id) => [name, id]));

/** Every tint carries this many colors on the wire, whatever the client data listed. */
const TINT_COLORS = 4;

/**
 * The wire name of a persona piece type.
 *
 * The client data calls a piece `persona_eyes`; the wire calls it `eyes`. The hands are the
 * one irregular case: `persona_hand` in the client data, `hands` on the wire.
 */
const pieceWireType = (pieceType: string): string =>
    pieceType === 'persona_hand' ? 'hands' : pieceType.replace(/^persona_/, '');

/**
 * A pack id as the UUID the wire carries, or the zero UUID when it is not one.
 *
 * `UUID.fromString` throws on anything but 32 hex digits, and a thrown skin takes the whole
 * player list with it, so an empty or malformed pack id is sent as all zeroes instead.
 */
const packIdToUuid = (packId: string): UUID =>
    /^[0-9a-fA-F]{32}$/.test(packId.trim().replaceAll('-', '')) ? UUID.fromString(packId) : new UUID();

/**
 * A client-data color as the ARGB integer the wire carries.
 *
 * Tint colors arrive as `#aarrggbb` (`#ffa12722`) and the skin color as `#rrggbb`
 * (`#b37b62`), which is opaque. `#0` is no color. Anything that is not parseable hex is sent
 * as zero, which is what a Bedrock Dedicated Server puts on the wire for a skin that carries no
 * color - it tints nothing.
 */
const colorToArgb = (color: string): number => {
    const hex = color.replace(/^#/, '');
    if (!/^[0-9a-fA-F]{1,8}$/.test(hex)) return 0;

    const value = Number.parseInt(hex, 16);
    return (hex.length === 6 ? 0xff_00_00_00 | value : value) | 0;
};

/**
 * A wire ARGB integer as the `#aarrggbb` string the client data uses, so a color read off the
 * wire goes back out as the same four bytes.
 */
const argbToColor = (argb: number): string => `#${(argb >>> 0).toString(16).padStart(8, '0')}`;

/**
 * Writes an ARGB color the way gophertunnel's `BEARGB` does.
 *
 * It packs `A | R<<8 | G<<16 | B<<24` and writes that big endian, so the bytes on the wire
 * are B, G, R, A. Writing the ARGB integer little endian produces the same four bytes.
 */
const writeColor = (stream: BinaryStream, argb: number): void => {
    stream.writeIntLE(argb);
};

export default class Skin {
    private id!: string;
    private playFabId!: string;
    private resourcePatch!: string;
    private image!: SkinImage;
    private readonly animations: Set<SkinAnimation> = new Set();
    private cape!: SkinCape;
    private geometry!: string;
    private geometryDataEngineVersion = '0.0.0';
    private animationData!: string;
    private premium!: boolean;
    private persona!: boolean;
    private capeOnClassicSkin!: boolean;
    private primaryUser = false;
    private overridesPlayerAppearance = true;
    private color = '#0';
    private armSize = 'wide';
    private personaData!: SkinPersona;
    private profileHash = '';

    /**
     * Full skin ID, computed because
     * not sent on JWT.
     */
    public fullId!: string;
    public isTrusted = true;

    /**
     * Loads a skin from a JSON file containing skin data
     * using minecraft bedrock login fields.
     *
     * (loads the skin persona)
     */
    public static fromJWT(jwt: JWT): Skin {
        const skin = new Skin();

        // Read skin
        skin.id = text(jwt.SkinId);
        skin.resourcePatch = decode(jwt.SkinResourcePatch);
        skin.image = new SkinImage({
            width: jwt.SkinImageWidth,
            height: jwt.SkinImageHeight,
            data: Buffer.from(text(jwt.SkinData), 'base64')
        });
        skin.playFabId = text(jwt.PlayFabId);
        skin.color = text(jwt.SkinColor);
        skin.armSize = text(jwt.ArmSize);

        // Read animations
        for (const animation of jwt.AnimatedImageData) {
            skin.animations.add(
                new SkinAnimation({
                    image: new SkinImage({
                        width: animation.ImageWidth,
                        height: animation.ImageHeight,
                        data: Buffer.from(animation.Image, 'base64')
                    }),
                    frames: animation.Frames,
                    type: animation.Type,
                    expression: animation.AnimationExpression
                })
            );
        }

        // Read cape
        skin.cape = new SkinCape({
            id: text(jwt.CapeId),
            image: new SkinImage({
                width: jwt.CapeImageWidth,
                height: jwt.CapeImageHeight,
                data: Buffer.from(text(jwt.CapeData), 'base64')
            })
        });

        // TODO: make a class to manage geometry
        skin.geometry = decode(jwt.SkinGeometryData);

        // TODO: Most of the times is empty, figure out what is it
        skin.animationData = decode(jwt.SkinAnimationData);

        // Read skin boolean properties
        skin.premium = jwt.PremiumSkin;
        skin.persona = jwt.PersonaSkin;
        skin.capeOnClassicSkin = jwt.CapeOnClassicSkin;

        // Avoid reading when skin is not persona type
        if (skin.persona) {
            skin.personaData = new SkinPersona();

            // Read persona pieces
            for (const personaPiece of jwt.PersonaPieces) {
                skin.personaData.getPieces().add(
                    new SkinPersonaPiece({
                        def: personaPiece.IsDefault,
                        packId: personaPiece.PackId,
                        pieceId: personaPiece.PieceId,
                        pieceType: personaPiece.PieceType,
                        productId: personaPiece.ProductId
                    })
                );
            }

            // Read piece tint colors
            for (const pieceTintColor of jwt.PieceTintColors) {
                const tintColor = new SkinPersonaPieceTintColor();
                tintColor.getColors().push(...pieceTintColor.Colors);
                tintColor.setPieceType(pieceTintColor.PieceType);
                skin.personaData.getTintColors().add(tintColor);
            }
        }

        // Compute a full id
        skin.fullId = skin.id + skin.getCape().getId();
        return skin;
    }

    /**
     * Writes the skin as protocol 2193 carries it.
     *
     * The layout had drifted years out of date - it was still the 748-era shape, which is
     * exactly the sort of thing that only shows up against a real client, because this
     * server's own client decoded it with the same stale reader. Checked field for field
     * against gophertunnel's `protocol/skin.go` and against the bytes a Bedrock Dedicated
     * Server 1.26.51 puts on the wire. What was wrong:
     *
     * - The animation, persona-piece and tint counts were fixed 32-bit little-endian ints;
     *   they are unsigned varints, like every other list.
     * - The arm size was a string; it is a single byte (`slim` 0, `wide` 1).
     * - The skin color was a string; it is four bytes, B, G, R, A.
     * - The tail was missing two fields the client reads: `trusted`, sent as the string
     *   `"true"`/`"false"`, and a profile hash string. Without them the entry after this one
     *   in the player list is read from the wrong place, and the client drops the join.
     *
     * The persona branch was missed by that pass and found the same way, by a 1.26.51 client
     * with a character-creator skin dropping the join with `InitialConnection-90` (#2582).
     * A piece's type and pack id went out as strings; the type is a uint32 and the pack id a
     * 16-byte UUID. A tint's colors went out as a counted list of strings; they are exactly
     * four colors of four bytes each, with no count, under the piece's short wire name.
     */
    public networkSerialize(stream: BinaryStream): void {
        NetworkUtil.writeString(stream, this.getId());
        NetworkUtil.writeString(stream, this.getPlayFabId());
        NetworkUtil.writeString(stream, this.getResourcePatch());

        // Skin image
        this.getImage().networkSerialize(stream);

        // Animations
        stream.writeUnsignedVarInt(this.getAnimations().size);
        for (const animation of this.getAnimations()) {
            animation.getImage().networkSerialize(stream);
            stream.writeUnsignedVarInt(animation.getType());
            stream.writeFloatLE(animation.getFrames());
            stream.writeUnsignedVarInt(animation.getExpression());
        }

        // Cape image
        this.getCape().getImage().networkSerialize(stream);

        // Miscellaneous
        NetworkUtil.writeString(stream, this.getGeometry());
        NetworkUtil.writeString(stream, this.getGeometryDataEngineVersion());
        NetworkUtil.writeString(stream, this.getAnimationData());
        NetworkUtil.writeString(stream, this.getCape().getId());
        NetworkUtil.writeString(stream, this.getFullId());
        stream.writeByte(this.getArmSize() === 'slim' ? 0 : 1);
        writeColor(stream, colorToArgb(this.getColor()));

        // Persona data is only kept for a persona skin.
        if (this.isPersona()) {
            const persona = this.getPersonaData();

            stream.writeUnsignedVarInt(persona.getPieces().size);
            for (const piece of persona.getPieces()) {
                NetworkUtil.writeString(stream, piece.getPieceId());
                stream.writeUnsignedIntLE(PIECE_TYPE_IDS.get(pieceWireType(piece.getPieceType())) ?? 0);
                packIdToUuid(piece.getPackId()).networkSerialize(stream);
                stream.writeBoolean(piece.isDefault());
                NetworkUtil.writeString(stream, piece.getProductId());
            }

            // Four colors per tint, no count. A tint the client data gave fewer is padded
            // with no color; one it gave more is cut to four.
            stream.writeUnsignedVarInt(persona.getTintColors().size);
            for (const tint of persona.getTintColors()) {
                NetworkUtil.writeString(stream, pieceWireType(tint.getPieceType()));
                for (let index = 0; index < TINT_COLORS; index++) {
                    writeColor(stream, colorToArgb(tint.getColors()[index] ?? '#0'));
                }
            }
        } else {
            stream.writeUnsignedVarInt(0); // Persona pieces
            stream.writeUnsignedVarInt(0); // Tint colors
        }

        stream.writeBoolean(this.isPremium());
        stream.writeBoolean(this.isPersona());
        stream.writeBoolean(this.isCapeOnClassicSkin());
        stream.writeBoolean(this.isPrimaryUser());
        stream.writeBoolean(this.overridesAppearance());

        // `TrustedSkinFlag` travels as a string. This server vouches for no skin, so it goes out
        // as `false` whatever the client claimed; `networkDeserialize` still records the claim
        // in `isTrusted`. A profile hash string follows it.
        NetworkUtil.writeString(stream, 'false');
        NetworkUtil.writeString(stream, this.getProfileHash());
    }

    /**
     * Reads a skin as protocol 2193 carries it, field for field the inverse of
     * {@link networkSerialize}.
     *
     * Wire values are stored the way the client data would have given them, so a skin read
     * here and written again produces the same bytes: the arm size byte becomes `slim` or
     * `wide`, colors become `#aarrggbb`, and a piece's pack id becomes its UUID string. Persona
     * piece types are kept by their wire name (`body`, `hands`), which the writer accepts as it
     * is. A piece type above the known range reads as `unknown`. The persona pieces and tints
     * arrive before the `IsPersona` flag, so they are read for every skin and kept only when
     * the flag is set. `TrustedSkinFlag` is compared case-insensitively: the docs spell it
     * `"True"`, gophertunnel writes `true`.
     */
    public static networkDeserialize(stream: BinaryStream): Skin {
        const skin = new Skin();

        skin.id = NetworkUtil.readString(stream);
        skin.playFabId = NetworkUtil.readString(stream);
        skin.resourcePatch = NetworkUtil.readString(stream);
        skin.image = SkinImage.networkDeserialize(stream);

        for (let index = 0, count = stream.readUnsignedVarInt(); index < count; index++) {
            const image = SkinImage.networkDeserialize(stream);
            const type = stream.readUnsignedVarInt();
            const frames = stream.readFloatLE();
            const expression = stream.readUnsignedVarInt();
            skin.animations.add(new SkinAnimation({ image, frames, type, expression }));
        }

        const capeImage = SkinImage.networkDeserialize(stream);
        skin.geometry = NetworkUtil.readString(stream);
        skin.geometryDataEngineVersion = NetworkUtil.readString(stream);
        skin.animationData = NetworkUtil.readString(stream);
        skin.cape = new SkinCape({ id: NetworkUtil.readString(stream), image: capeImage });
        skin.fullId = NetworkUtil.readString(stream);
        skin.armSize = stream.readByte() === 0 ? 'slim' : 'wide';
        skin.color = argbToColor(stream.readIntLE());

        const persona = new SkinPersona();
        for (let index = 0, count = stream.readUnsignedVarInt(); index < count; index++) {
            const pieceId = NetworkUtil.readString(stream);
            const pieceType = PIECE_TYPES[stream.readUnsignedIntLE()] ?? 'unknown';
            const packId = UUID.networkDeserialize(stream).toString();
            const def = stream.readBoolean();
            const productId = NetworkUtil.readString(stream);
            persona.getPieces().add(new SkinPersonaPiece({ def, packId, pieceId, pieceType, productId }));
        }

        for (let index = 0, count = stream.readUnsignedVarInt(); index < count; index++) {
            const tint = new SkinPersonaPieceTintColor();
            tint.setPieceType(NetworkUtil.readString(stream));
            for (let color = 0; color < TINT_COLORS; color++) {
                tint.getColors().push(argbToColor(stream.readIntLE()));
            }
            persona.getTintColors().add(tint);
        }

        skin.premium = stream.readBoolean();
        skin.persona = stream.readBoolean();
        skin.capeOnClassicSkin = stream.readBoolean();
        skin.primaryUser = stream.readBoolean();
        skin.overridesPlayerAppearance = stream.readBoolean();
        skin.isTrusted = NetworkUtil.readString(stream).toLowerCase() === 'true';
        skin.profileHash = NetworkUtil.readString(stream);

        if (skin.persona) skin.personaData = persona;
        return skin;
    }

    public getId(): string {
        return this.id;
    }

    public getFullId(): string {
        return this.fullId || this.getId() + this.getCape().getId();
    }

    public getPlayFabId(): string {
        return this.playFabId;
    }

    public getResourcePatch(): string {
        return this.resourcePatch;
    }

    public getImage(): SkinImage {
        return this.image;
    }

    public getAnimations(): Set<SkinAnimation> {
        return this.animations;
    }

    public getAnimationData(): string {
        return this.animationData;
    }

    public isPersona(): boolean {
        return this.persona;
    }

    public isPremium(): boolean {
        return this.premium;
    }

    public isCapeOnClassicSkin(): boolean {
        return this.capeOnClassicSkin;
    }

    public getColor(): string {
        return this.color;
    }

    public getArmSize(): string {
        return this.armSize;
    }

    public getPersonaData(): SkinPersona {
        return this.personaData;
    }

    public getGeometry(): string {
        return this.geometry;
    }

    /** The `GeometryDataMinEngineVersion` string; `0.0.0` for a skin built from login data. */
    public getGeometryDataEngineVersion(): string {
        return this.geometryDataEngineVersion;
    }

    /** The wire's `IsPrimaryUser` flag. False for a skin built from login data. */
    public isPrimaryUser(): boolean {
        return this.primaryUser;
    }

    /** The wire's `OverridesPlayerAppearance` flag. True for a skin built from login data. */
    public overridesAppearance(): boolean {
        return this.overridesPlayerAppearance;
    }

    /** The wire's `ProfileHash` string; empty for a skin built from login data. */
    public getProfileHash(): string {
        return this.profileHash;
    }

    public getCape(): SkinCape {
        return this.cape;
    }
}
