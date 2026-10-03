import { BuildPlatform } from '@jsprismarine/minecraft';
import { DEFAULT_SKIN_RESOURCE_PATCH, SKIN_HEIGHT, SKIN_WIDTH, createDefaultSkinImage } from './DefaultSkin';

/**
 * The payload of the second JWT a `Login` carries.
 *
 * Every field is `PascalCase` because that is how Mojang names them on the wire, and the
 * server reads them by those exact names. The shape is not optional in practice: the server
 * builds a `Skin` out of this and reads `SkinData`, `SkinResourcePatch`, `CapeData`,
 * `SkinGeometryData` and `AnimatedImageData` unconditionally, so a client that omits any of
 * them crashes the handler rather than being politely refused.
 */
export interface ClientDataPayload {
    ClientRandomId: number;
    CurrentInputMode: number;
    DefaultInputMode: number;
    DeviceId: string;
    DeviceModel: string;
    DeviceOS: number;
    GameVersion: string;
    GuiScale: number;
    LanguageCode: string;
    PlatformOnlineId: string;
    PlayFabId: string;
    SelfSignedId: string;
    ServerAddress: string;
    ThirdPartyName: string;
    ThirdPartyNameOnly: boolean;

    AnimatedImageData: AnimatedImage[];
    ArmSize: string;
    CapeData: string;
    CapeId: string;
    CapeImageHeight: number;
    CapeImageWidth: number;
    CapeOnClassicSkin: boolean;
    PersonaSkin: boolean;
    PremiumSkin: boolean;
    SkinAnimationData: string;
    SkinColor: string;
    SkinData: string;
    SkinGeometryData: string;
    SkinId: string;
    SkinImageHeight: number;
    SkinImageWidth: number;
    SkinResourcePatch: string;

    [key: string]: unknown;
}

export interface AnimatedImage {
    Image: string;
    ImageWidth: number;
    ImageHeight: number;
    Frames: number;
    Type: number;
    AnimationExpression: number;
}

export interface ClientDataOptions {
    readonly serverAddress: string;
    readonly clientRandomId: number;
    readonly selfSignedId: string;
    /**
     * The name to play under when nothing vouched for one.
     *
     * Only an unauthenticated login needs it. Up to 1.26.10 the name travelled in the
     * certificate chain's `extraData`, and this stayed empty; a login that carries a token
     * instead of a chain has nowhere else to put it.
     */
    readonly displayName?: string;
    readonly languageCode?: string;
    readonly gameVersion?: string;
    readonly deviceId?: string;
    readonly deviceModel?: string;
    readonly deviceOS?: number;
    readonly skinId?: string;
    /** Raw RGBA, `width * height * 4` bytes. Defaults to the generated skin. */
    readonly skinImage?: Buffer;
    readonly skinWidth?: number;
    readonly skinHeight?: number;
}

/**
 * Builds the client data a login carries, filling in everything the server insists on.
 *
 * The defaults describe a Windows client on the pinned protocol version, which is what the
 * bot harness and the headless client both want; a GUI client overrides the few fields that
 * are genuinely about the machine it is running on.
 */
export const createClientData = (options: ClientDataOptions): ClientDataPayload => {
    const image = options.skinImage ?? createDefaultSkinImage();

    return {
        ClientRandomId: options.clientRandomId,
        // 1 is mouse and keyboard in Mojang's InputMode enum, which is what a desktop
        // client reports whether or not anything is actually plugged in.
        CurrentInputMode: 1,
        DefaultInputMode: 1,
        DeviceId: options.deviceId ?? '00000000-0000-0000-0000-000000000000',
        DeviceModel: options.deviceModel ?? 'JSPrismarine',
        // WIN32, which is the only Windows platform left. This used to report UWP, the store
        // build, and 1.26.50 removed that member from `BuildPlatform` along with the other
        // retired ones - a Bedrock Dedicated Server now validates the platform and answers a
        // login naming a value outside the enum with a `PacketViolationWarning` that says only
        // "Connection Request invalid". Verified against BDS 1.26.51.1: 7, 5, 10, 14 and 99 are
        // refused, every member the 2193 documentation lists is admitted.
        DeviceOS: options.deviceOS ?? BuildPlatform.WIN32,
        GameVersion: options.gameVersion ?? '1.26.51',
        GuiScale: 0,
        LanguageCode: options.languageCode ?? 'en_GB',
        PlatformOnlineId: '',
        // Only meaningful for an authenticated client; the server stores it and hands it back.
        PlayFabId: '',
        SelfSignedId: options.selfSignedId,
        ServerAddress: options.serverAddress,
        ThirdPartyName: options.displayName ?? '',
        ThirdPartyNameOnly: false,

        AnimatedImageData: [],
        ArmSize: 'wide',
        // No cape. The fields still have to be present and base64 decodable.
        CapeData: '',
        CapeId: '',
        CapeImageHeight: 0,
        CapeImageWidth: 0,
        CapeOnClassicSkin: false,
        // Not a persona skin, which is what lets `PersonaPieces` and `PieceTintColors` be
        // left out entirely - the server only reads those when this is true.
        PersonaSkin: false,
        PremiumSkin: false,
        SkinAnimationData: '',
        SkinColor: '#0',
        SkinData: image.toString('base64'),
        SkinGeometryData: '',
        SkinId: options.skinId ?? 'JSPrismarine-Default',
        SkinImageHeight: options.skinHeight ?? SKIN_HEIGHT,
        SkinImageWidth: options.skinWidth ?? SKIN_WIDTH,
        SkinResourcePatch: Buffer.from(DEFAULT_SKIN_RESOURCE_PATCH, 'utf-8').toString('base64')
    };
};
