import Client, { MINECRAFT_VERSION, PROTOCOL_VERSION } from './Client';
import Bot, { TICK_INTERVAL_MS } from './bot/Bot';
import Fleet from './bot/Fleet';
import { Samples, formatReport } from './bot/Metrics';
import Random from './bot/Random';
import { BEHAVIOUR_NAMES, BEHAVIOURS, createBehaviours } from './bot/behaviour/Behaviours';
import BreakBehaviour from './bot/behaviour/BreakBehaviour';
import ChatBehaviour from './bot/behaviour/ChatBehaviour';
import LookBehaviour from './bot/behaviour/LookBehaviour';
import WalkBehaviour from './bot/behaviour/WalkBehaviour';
import LoginSequence, { LoginStage } from './login/LoginSequence';
import ClientPacketRegistry from './net/ClientPacketRegistry';
import ClientSession from './net/ClientSession';
import RakNetTransport from './net/RakNetTransport';
import { SendPriority } from './net/ITransport';

export {
    BEHAVIOURS,
    BEHAVIOUR_NAMES,
    Bot,
    BreakBehaviour,
    ChatBehaviour,
    Client,
    ClientPacketRegistry,
    ClientSession,
    Fleet,
    LoginSequence,
    LoginStage,
    MINECRAFT_VERSION,
    PROTOCOL_VERSION,
    LookBehaviour,
    RakNetTransport,
    Random,
    Samples,
    SendPriority,
    TICK_INTERVAL_MS,
    WalkBehaviour,
    createBehaviours,
    formatReport
};

export default Client;

export type { ClientOptions } from './Client';
export type { LoginResult, LoginSequenceOptions } from './login/LoginSequence';
export type { DecodedPacket, PacketConstructor } from './net/ClientPacketRegistry';
export type { ITransport, TransportEvents, TransportStats } from './net/ITransport';
export type { RakNetTransportOptions } from './net/RakNetTransport';
export type { BotOptions } from './bot/Bot';
export type { FleetOptions } from './bot/Fleet';
export type { FleetReport, LatencySummary } from './bot/Metrics';
export type { Behaviour, BehaviourContext } from './bot/behaviour/Behaviour';
