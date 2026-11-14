/**
 * `EducationSettingsPacket`: the Education Edition settings for a world, sent once while the
 * game is starting.
 *
 * Wire layout at protocol 2193: Code Builder Default URI and Code Builder Title as strings,
 * Can resize Code Builder and Disable legacy title bar as booleans, Post Process Filter and
 * Screenshot Border Resource Path as strings, Agent Capabilities as an optional Can Modify
 * Blocks boolean, Local Settings as an optional Code Builder Override Uri string, the
 * deprecated Always False boolean, then External Link Settings as an optional URL and Display
 * Name pair. The three optionals are written with a presence byte at 2193, and the deprecated
 * boolean sits between the second and the third.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/education-settings-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The fields sent once to give an Education Edition client its world settings. */
export const educationSettingsPacket = definePacket('EducationSettingsPacket', {
    /** `Code Builder Default URI`: the URI the Code Builder panel opens. */
    codeBuilderDefaultUri: t.string,
    /** `Code Builder Title`: the title shown on the Code Builder panel. */
    codeBuilderTitle: t.string,
    /** `Can resize Code Builder`: whether the player may resize the panel. */
    canResizeCodeBuilder: t.bool,
    /** `Disable legacy title bar`: whether the client hides the legacy title bar. */
    disableLegacyTitleBar: t.bool,
    /** `Post Process Filter`: the name of a filter the client applies to the whole screen. */
    postProcessFilter: t.string,
    /** `Screenshot Border Resource Path`: the border drawn around in-game screenshots. */
    screenshotBorderResourcePath: t.string,
    /** `Agent Capabilities`: whether the Agent may place and break blocks, when sent. */
    canModifyBlocks: t.present(t.bool),
    /** `Local Settings`: the per-world Code Builder Override Uri, when sent. */
    codeBuilderOverrideUri: t.present(t.string),
    /** `(Deprecated) Always False`: named for the quiz feature it used to switch on. */
    hasQuiz: t.bool,
    /** `External Link Settings`: a link offered alongside the world, when sent. */
    externalLinkSettings: t.present(t.record({ url: t.string, displayName: t.string }))
});

/** Payload carried by `EducationSettingsPacket`. */
export type EducationSettingsPayload = PayloadOf<typeof educationSettingsPacket>;
