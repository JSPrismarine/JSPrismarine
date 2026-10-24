import Client, { MINECRAFT_VERSION, PROTOCOL_VERSION } from './Client';
import Bot, { TICK_INTERVAL_MS } from './bot/Bot';
import Fleet from './bot/Fleet';
import { Samples, formatReport } from './bot/Metrics';
import Random from './bot/Random';
import { BEHAVIOR_NAMES, BEHAVIORS, createBehaviors } from './bot/behavior/Behaviors';
import BreakBehavior from './bot/behavior/BreakBehavior';
import ChatBehavior from './bot/behavior/ChatBehavior';
import LookBehavior from './bot/behavior/LookBehavior';
import WalkBehavior from './bot/behavior/WalkBehavior';
import LoginSequence, { LoginStage } from './login/LoginSequence';
import ClientPacketRegistry from './net/ClientPacketRegistry';
import ClientSession from './net/ClientSession';
import RakNetTransport from './net/RakNetTransport';
import { SendPriority } from './net/ITransport';

export {
    BEHAVIORS,
    BEHAVIOR_NAMES,
    Bot,
    BreakBehavior,
    ChatBehavior,
    Client,
    ClientPacketRegistry,
    ClientSession,
    Fleet,
    LoginSequence,
    LoginStage,
    MINECRAFT_VERSION,
    PROTOCOL_VERSION,
    LookBehavior,
    RakNetTransport,
    Random,
    Samples,
    SendPriority,
    TICK_INTERVAL_MS,
    WalkBehavior,
    createBehaviors,
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
export type { Behavior, BehaviorContext } from './bot/behavior/Behavior';
