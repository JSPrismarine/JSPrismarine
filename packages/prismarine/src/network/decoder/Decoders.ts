import AnimateDecoder from './AnimateDecoder';
import BossEventDecoder from './BossEventDecoder';
import InteractDecoder from './InteractDecoder';

/**
 * Every Bedrock packet decoder, which `PacketHandlerRegistry.enable` wraps into a packet handler
 * and registers under its packet's name. A test checks that each one names a packet Protocol
 * exports and that no packet has both a decoder here and a handler in `Handlers`.
 */
export { AnimateDecoder, BossEventDecoder, InteractDecoder };
