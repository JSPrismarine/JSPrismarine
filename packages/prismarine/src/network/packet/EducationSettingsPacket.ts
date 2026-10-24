import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** A link the Education Edition client offers alongside the world. */
export interface ExternalLinkSettings {
    url: string;
    displayName: string;
}

/**
 * The Education Edition settings for a world, sent once while the game is starting.
 *
 * Code Builder is the feature most of this configures: the client opens the given URI in a
 * panel, which is how an Education world drives the server from code. The base game ignores
 * the packet.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Code Builder Default URI and Code Builder Title as strings,
 * Can resize Code Builder and Disable legacy title bar as booleans, Post Process Filter and
 * Screenshot Border Resource Path as strings, Agent Capabilities as an optional Can Modify
 * Blocks boolean, Local Settings as an optional Code Builder Override Uri string, the
 * deprecated Always False boolean, then External Link Settings as an optional URL and Display
 * Name pair.
 *
 * The three optionals are consecutive, and the docs do not mark them optional until the 2207
 * changelog. gophertunnel writes their presence bytes at 2193 and the deprecated boolean sits
 * between the second and the third, so leaving one out shifts everything after it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/education-settings-packet/
 */
export default class EducationSettingsPacket extends DataPacket {
    public static NetID = Identifiers.EducationSettingsPacket;

    /** URI the Code Builder panel opens. */
    public codeBuilderDefaultUri = '';

    /** Title shown on the Code Builder panel. */
    public codeBuilderTitle = '';

    public canResizeCodeBuilder = false;

    public disableLegacyTitleBar = false;

    /** Name of a post process filter the client applies to the whole screen. */
    public postProcessFilter = '';

    /** Resource path of the border drawn around in-game screenshots. */
    public screenshotBorderResourcePath = '';

    /** Whether the Agent may place and break blocks. Absent leaves the client's default. */
    public canModifyBlocks?: boolean;

    /** Per-world override for the Code Builder URI. */
    public codeBuilderOverrideUri?: string;

    /** Deprecated and always false. Named for the quiz feature it used to switch on. */
    public hasQuiz = false;

    public externalLinkSettings?: ExternalLinkSettings;

    /** Reads the Code Builder settings, the agent capabilities and the external link. */
    public decodePayload(): void {
        this.codeBuilderDefaultUri = NetworkUtil.readString(this);
        this.codeBuilderTitle = NetworkUtil.readString(this);
        this.canResizeCodeBuilder = this.readBoolean();
        this.disableLegacyTitleBar = this.readBoolean();
        this.postProcessFilter = NetworkUtil.readString(this);
        this.screenshotBorderResourcePath = NetworkUtil.readString(this);

        this.canModifyBlocks = this.readBoolean() ? this.readBoolean() : undefined;
        this.codeBuilderOverrideUri = this.readBoolean() ? NetworkUtil.readString(this) : undefined;
        this.hasQuiz = this.readBoolean();
        this.externalLinkSettings = this.readBoolean()
            ? { url: NetworkUtil.readString(this), displayName: NetworkUtil.readString(this) }
            : undefined;
    }

    /** Writes the Code Builder settings, the agent capabilities and the external link. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.codeBuilderDefaultUri);
        NetworkUtil.writeString(this, this.codeBuilderTitle);
        this.writeBoolean(this.canResizeCodeBuilder);
        this.writeBoolean(this.disableLegacyTitleBar);
        NetworkUtil.writeString(this, this.postProcessFilter);
        NetworkUtil.writeString(this, this.screenshotBorderResourcePath);

        if (this.canModifyBlocks === undefined) {
            this.writeBoolean(false);
        } else {
            this.writeBoolean(true);
            this.writeBoolean(this.canModifyBlocks);
        }

        if (this.codeBuilderOverrideUri === undefined) {
            this.writeBoolean(false);
        } else {
            this.writeBoolean(true);
            NetworkUtil.writeString(this, this.codeBuilderOverrideUri);
        }

        this.writeBoolean(this.hasQuiz);

        if (this.externalLinkSettings === undefined) {
            this.writeBoolean(false);
        } else {
            this.writeBoolean(true);
            NetworkUtil.writeString(this, this.externalLinkSettings.url);
            NetworkUtil.writeString(this, this.externalLinkSettings.displayName);
        }
    }
}
