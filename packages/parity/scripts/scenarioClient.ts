/**
 * The headless client a scripting scenario's capture joins the Bedrock Dedicated Server with:
 * it answers each form and data-driven screen the server sends as the scenario's
 * {@link FormClientScript} says, and records the form packets it received.
 *
 * The capture runs under plain node, whose resolver rejects the extensionless relative imports of
 * a workspace package's TypeScript sources. This loads `@jsprismarine/client` and
 * `@jsprismarine/protocol` through `tsx`, the resolver the other capture halves start under
 * (`packages/bedrock-data/utils/bedrock-dump/host.ts`).
 */
import { join } from 'node:path';

import { tsImport } from 'tsx/esm/api';

import type NetworkPacket from '../../protocol/src/NetworkPacket.ts';
import type { DataStoreValue } from '../../protocol/src/bedrock/structure/DataStoreUpdate.ts';
import type { ClientObservation, ScenarioClient, ScreenCloseReason, ScreenStep } from '../src/scripting/formClient.ts';
import { cancelByte, FormClientScript } from '../src/scripting/formClient.ts';

const PACKAGES = join(import.meta.dirname, '..', '..');

/** A joined scenario client. */
export interface JoinedScenarioClient {
    /** The form packets received so far. */
    readonly observations: () => readonly ClientObservation[];
    /** Leaves the server, when it has not left already. */
    readonly leave: () => void;
}

/** Where the scenario client dials the staged server. */
export interface ScenarioClientTarget {
    readonly port: number;
    readonly network: 'raknet' | 'nethernet';
    readonly protocolVersion: number;
}

/**
 * Joins the staged server and starts answering forms.
 * @throws {Error} When the login fails.
 */
export const joinScenarioClient = async (
    scenario: ScenarioClient,
    target: ScenarioClientTarget
): Promise<JoinedScenarioClient> => {
    // tsImport returns an untyped namespace; the client and protocol sources declare these exports.
    const { Client } = await tsImport(join(PACKAGES, 'client', 'src', 'index.ts'), import.meta.url);
    const protocol = await tsImport(join(PACKAGES, 'protocol', 'src', 'index.ts'), import.meta.url);
    const { ModalFormRequestPacket, ModalFormResponsePacket, PacketIdentifier } = protocol;
    // The data-driven UI packets are not in the protocol package's index, so each comes from its
    // own module. tsImport returns an untyped namespace; each annotation names the module it loads.
    const load = (path: string) =>
        tsImport(join(PACKAGES, 'protocol', 'src', 'bedrock', `${path}.ts`), import.meta.url);
    const {
        default: ClientboundDataStorePacket
    }: typeof import('../../protocol/src/bedrock/packet/ClientboundDataStorePacket.ts') = await load(
        'packet/ClientboundDataStorePacket'
    );
    const {
        default: ClientboundDataDrivenUIShowScreenPacket
    }: typeof import('../../protocol/src/bedrock/packet/ClientboundDataDrivenUIShowScreenPacket.ts') = await load(
        'packet/ClientboundDataDrivenUIShowScreenPacket'
    );
    const {
        default: ClientboundDataDrivenUICloseScreenPacket
    }: typeof import('../../protocol/src/bedrock/packet/ClientboundDataDrivenUICloseScreenPacket.ts') = await load(
        'packet/ClientboundDataDrivenUICloseScreenPacket'
    );
    const {
        default: ServerboundDataStorePacket
    }: typeof import('../../protocol/src/bedrock/packet/ServerboundDataStorePacket.ts') = await load(
        'packet/ServerboundDataStorePacket'
    );
    const {
        default: ServerboundDataDrivenScreenClosedPacket,
        DataDrivenScreenClosedReason
    }: typeof import('../../protocol/src/bedrock/packet/ServerboundDataDrivenScreenClosedPacket.ts') = await load(
        'packet/ServerboundDataDrivenScreenClosedPacket'
    );
    const {
        default: DataStoreUpdate,
        DataStoreValueType
    }: typeof import('../../protocol/src/bedrock/structure/DataStoreUpdate.ts') =
        await load('structure/DataStoreUpdate');
    /** The protocol's member for a close reason, which spells each the way the scenario does. */
    const closeReasonOf = (reason: ScreenCloseReason) => {
        const member = Object.values(DataDrivenScreenClosedReason).find((each) => each === reason);
        if (member === undefined) throw new Error(`No close reason ${reason}`);
        return member;
    };

    const script = new FormClientScript(scenario);
    const client = new Client({
        host: '127.0.0.1',
        port: target.port,
        displayName: 'FormClient',
        loginTimeoutMs: 120_000,
        network: target.network,
        protocolVersion: target.protocolVersion
    });
    let left = false;
    const leave = (): void => {
        if (left) return;
        left = true;
        client.disconnect();
    };

    const session = client.getSession();
    /** Decodes a packet at the protocol the client dialled. */
    const decode = <T>(Packet: new (data: null, buffer: Buffer) => NetworkPacket<T>, buffer: Buffer): T => {
        const decoded = new Packet(null, buffer);
        decoded.codecProtocol = target.protocolVersion;
        decoded.decode();
        const data = decoded.getPacketData();
        if (data === null) throw new Error(`${decoded.getName()} decoded to nothing`);
        return data;
    };
    const closed = (formId: number, closeReason: ScreenCloseReason): void =>
        void session.send(
            new ServerboundDataDrivenScreenClosedPacket({ formId, closeReason: closeReasonOf(closeReason) })
        );
    const play = ({ property, formId, actions }: ScreenStep): void => {
        for (const action of actions) {
            if ('leave' in action) {
                leave();
                return;
            }
            if ('close' in action) {
                closed(formId, action.close);
                continue;
            }
            const { propertyUpdateCount, pathUpdateCount } = script.written(property, action.write);
            const data: DataStoreValue =
                typeof action.value === 'number'
                    ? { type: DataStoreValueType.DOUBLE, value: action.value }
                    : typeof action.value === 'boolean'
                      ? { type: DataStoreValueType.BOOLEAN, value: action.value }
                      : { type: DataStoreValueType.STRING, value: action.value };
            const update = new DataStoreUpdate(
                'minecraft',
                property,
                action.write,
                data,
                propertyUpdateCount,
                pathUpdateCount
            );
            void session.send(new ServerboundDataStorePacket({ update, variableUpdate: null }));
        }
    };

    session.on('raw', ({ id, buffer }: { id: number; buffer: Buffer }) => {
        if (id === PacketIdentifier.CLIENTBOUND_DATA_STORE) {
            script.dataStore(decode(ClientboundDataStorePacket, buffer).updates);
        } else if (id === PacketIdentifier.CLIENTBOUND_DATA_DRIVEN_UI_SHOW_SCREEN) {
            const { screenId, formId, dataInstanceId } = decode(ClientboundDataDrivenUIShowScreenPacket, buffer);
            play(script.screenShown(screenId, formId, dataInstanceId ?? 0));
        } else if (id === PacketIdentifier.CLIENTBOUND_DATA_DRIVEN_UI_CLOSE_SCREEN) {
            const { formId } = decode(ClientboundDataDrivenUICloseScreenPacket, buffer);
            for (const each of script.screenClosed(formId ?? null)) closed(each.formId, each.reason);
        } else if (id === PacketIdentifier.MODAL_FORM_REQUEST) {
            const request = new ModalFormRequestPacket(buffer);
            request.decode();
            const answer = script.formRequested(request.formId, request.formUiJson);
            if ('leave' in answer) {
                leave();
                return;
            }
            if ('ignore' in answer) return;
            const response = new ModalFormResponsePacket();
            response.formId = request.formId;
            if (answer.response !== undefined) response.jsonResponse = answer.response;
            if (answer.cancel !== undefined) response.formCancelReason = cancelByte(answer.cancel);
            void session.send(response);
        } else if (id === PacketIdentifier.CLIENTBOUND_CLOSE_FORM) {
            script.formsClosed();
        }
    });
    await client.connect();
    return { observations: () => script.observations, leave };
};
