// Peer connections and data channels over libdatachannel's C API. Every callback turns into an
// event in the queue (events.cpp); nothing here calls the runtime.
#include "events.hpp"
#include "jsp_native_network.h"

#include <rtc/rtc.h>

#include <cstring>
#include <mutex>
#include <map>
#include <set>
#include <string>
#include <vector>

namespace jsp {
void closeMuxes();
} // namespace jsp

namespace {

// Each peer connection and data channel carries the handle of the queue its events go to as
// libdatachannel's user pointer, so every callback knows its reader without a lookup of ours.
int32_t queueOf(void *pointer) { return static_cast<int32_t>(reinterpret_cast<intptr_t>(pointer)); }
void *pointerFor(int32_t queue) { return reinterpret_cast<void *>(static_cast<intptr_t>(queue)); }

// Never destroyed, as the event queues are not: a callback can arrive while the process exits.
std::mutex &liveMutex = *new std::mutex;
std::map<int, int32_t> &livePeers = *new std::map<int, int32_t>; // peer connection -> queue

size_t length(const char *text) { return text == nullptr ? 0 : std::strlen(text); }

void RTC_API onLog(rtcLogLevel level, const char *message) {
	jsp::pushLog(static_cast<int32_t>(level), message, length(message));
}

void RTC_API onDescription(int pc, const char *sdp, const char *type, void *ptr) {
	const int32_t answer = type != nullptr && std::strcmp(type, "answer") == 0 ? 1 : 0;
	jsp::pushEvent(queueOf(ptr), JSP_EVENT_DESCRIPTION, pc, answer, sdp, length(sdp));
}

void RTC_API onCandidate(int pc, const char *candidate, const char *mid, void *ptr) {
	const std::string midLine = std::string(mid == nullptr ? "" : mid) + "\n";
	jsp::pushEvent2(queueOf(ptr), JSP_EVENT_CANDIDATE, pc, 0, midLine.data(), midLine.size(), candidate, length(candidate));
}

void RTC_API onState(int pc, rtcState state, void *ptr) { jsp::pushEvent(queueOf(ptr), JSP_EVENT_STATE, pc, state, nullptr, 0); }

void RTC_API onIceState(int pc, rtcIceState state, void *ptr) {
	jsp::pushEvent(queueOf(ptr), JSP_EVENT_ICE_STATE, pc, state, nullptr, 0);
}

void RTC_API onGathering(int pc, rtcGatheringState state, void *ptr) {
	jsp::pushEvent(queueOf(ptr), JSP_EVENT_GATHERING, pc, state, nullptr, 0);
}

void RTC_API onOpen(int id, void *ptr) { jsp::pushEvent(queueOf(ptr), JSP_EVENT_OPEN, id, 0, nullptr, 0); }

void RTC_API onClosed(int id, void *ptr) { jsp::pushEvent(queueOf(ptr), JSP_EVENT_CLOSED, id, 0, nullptr, 0); }

void RTC_API onError(int id, const char *error, void *ptr) {
	jsp::pushEvent(queueOf(ptr), JSP_EVENT_ERROR, id, 0, error, length(error));
}

void RTC_API onMessage(int id, const char *message, int size, void *ptr) {
	// A negative size is a string of -size bytes, its terminating NUL included.
	if (size < 0) jsp::pushEvent(queueOf(ptr), JSP_EVENT_MESSAGE, id, 0, message, static_cast<size_t>(-size - 1));
	else jsp::pushEvent(queueOf(ptr), JSP_EVENT_MESSAGE, id, 1, message, static_cast<size_t>(size));
}

void RTC_API onBufferedLow(int id, void *ptr) { jsp::pushEvent(queueOf(ptr), JSP_EVENT_BUFFERED_LOW, id, 0, nullptr, 0); }

void watchChannel(int dc) {
	rtcSetOpenCallback(dc, onOpen);
	rtcSetClosedCallback(dc, onClosed);
	rtcSetErrorCallback(dc, onError);
	rtcSetMessageCallback(dc, onMessage);
	rtcSetBufferedAmountLowCallback(dc, onBufferedLow);
}

// The channel's callbacks are set here, on libdatachannel's thread, before its first message can
// arrive, so the queue always holds the channel before anything that happened on it.
void RTC_API onDataChannel(int pc, int dc, void *ptr) {
	rtcSetUserPointer(dc, ptr);
	watchChannel(dc);
	char label[256];
	const int labelSize = rtcGetDataChannelLabel(dc, label, sizeof(label));
	const uint8_t isOpen = rtcIsOpen(dc) ? 1 : 0;
	jsp::pushEvent2(queueOf(ptr), JSP_EVENT_DATA_CHANNEL, pc, dc, &isOpen, 1, label,
	                labelSize > 0 ? static_cast<size_t>(labelSize - 1) : 0);
}

std::vector<std::string> splitLines(const char *text) {
	std::vector<std::string> lines;
	if (text == nullptr) return lines;
	std::string current;
	for (const char *at = text; *at != '\0'; ++at) {
		if (*at == '\n') {
			if (!current.empty()) lines.push_back(current);
			current.clear();
		} else {
			current.push_back(*at);
		}
	}
	if (!current.empty()) lines.push_back(current);
	return lines;
}

} // namespace

extern "C" {

JSP_EXPORT int32_t jsp_abi_version(void) { return JSP_ABI_VERSION; }

JSP_EXPORT int32_t jsp_events_open(int32_t wake_port, int32_t log_level) {
	if (wake_port <= 0 || wake_port > 65535) return JSP_ERR_INVALID;
	static std::once_flag logger;
	std::call_once(logger, [log_level] {
		rtcInitLogger(static_cast<rtcLogLevel>(log_level), log_level > 0 ? onLog : nullptr);
	});
	rtcPreload();
	const int32_t queue = jsp::openQueue(static_cast<uint16_t>(wake_port), log_level > 0);
	return queue > 0 ? queue : JSP_ERR_FAILURE;
}

JSP_EXPORT void jsp_events_close(int32_t queue) {
	std::vector<int> peers;
	{
		std::lock_guard<std::mutex> lock(liveMutex);
		for (auto it = livePeers.begin(); it != livePeers.end();) {
			if (it->second == queue) {
				peers.push_back(it->first);
				it = livePeers.erase(it);
			} else {
				++it;
			}
		}
	}
	for (int pc : peers) {
		rtcClosePeerConnection(pc);
		rtcDeletePeerConnection(pc);
	}
	jsp::closeQueue(queue);
}

JSP_EXPORT void jsp_cleanup(void) {
	std::map<int, int32_t> peers;
	{
		std::lock_guard<std::mutex> lock(liveMutex);
		peers.swap(livePeers);
	}
	for (const auto &entry : peers) {
		rtcClosePeerConnection(entry.first);
		rtcDeletePeerConnection(entry.first);
	}
	jsp::closeMuxes();
	jsp::closeQueues();
	rtcCleanup();
}

JSP_EXPORT int32_t jsp_pc_create(int32_t queue, const char *bind_address, const char *ice_servers, int32_t port_begin,
                                 int32_t port_end, int32_t enable_ice_udp_mux, int32_t max_message_size) {
	if (port_begin < 0 || port_begin > 65535 || port_end < 0 || port_end > 65535) return JSP_ERR_INVALID;
	if (!jsp::queueOpen(queue)) return JSP_ERR_INVALID;
	const std::vector<std::string> servers = splitLines(ice_servers);
	std::vector<const char *> serverPointers;
	for (const std::string &server : servers) serverPointers.push_back(server.c_str());

	rtcConfiguration config;
	std::memset(&config, 0, sizeof(config));
	config.iceServers = serverPointers.empty() ? nullptr : serverPointers.data();
	config.iceServersCount = static_cast<int>(serverPointers.size());
	config.bindAddress = bind_address != nullptr && bind_address[0] != '\0' ? bind_address : nullptr;
	config.enableIceUdpMux = enable_ice_udp_mux != 0;
	config.portRangeBegin = static_cast<uint16_t>(port_begin);
	config.portRangeEnd = static_cast<uint16_t>(port_end);
	config.maxMessageSize = max_message_size;

	const int pc = rtcCreatePeerConnection(&config);
	if (pc < 0) return pc;
	rtcSetUserPointer(pc, pointerFor(queue));
	rtcSetLocalDescriptionCallback(pc, onDescription);
	rtcSetLocalCandidateCallback(pc, onCandidate);
	rtcSetStateChangeCallback(pc, onState);
	rtcSetIceStateChangeCallback(pc, onIceState);
	rtcSetGatheringStateChangeCallback(pc, onGathering);
	rtcSetDataChannelCallback(pc, onDataChannel);
	std::lock_guard<std::mutex> lock(liveMutex);
	livePeers.emplace(pc, queue);
	return pc;
}

JSP_EXPORT int32_t jsp_pc_set_remote_description(int32_t pc, const char *sdp, const char *type) {
	return rtcSetRemoteDescription(pc, sdp, type != nullptr && type[0] != '\0' ? type : nullptr);
}

JSP_EXPORT int32_t jsp_pc_set_local_description(int32_t pc, const char *type) {
	return rtcSetLocalDescription(pc, type != nullptr && type[0] != '\0' ? type : nullptr);
}

JSP_EXPORT int32_t jsp_pc_add_remote_candidate(int32_t pc, const char *candidate, const char *mid) {
	return rtcAddRemoteCandidate(pc, candidate, mid != nullptr && mid[0] != '\0' ? mid : nullptr);
}

JSP_EXPORT int32_t jsp_pc_local_description(int32_t pc, uint8_t *buffer, int32_t size) {
	return rtcGetLocalDescription(pc, reinterpret_cast<char *>(buffer), size);
}

JSP_EXPORT int32_t jsp_pc_selected_pair(int32_t pc, uint8_t *buffer, int32_t size) {
	if (buffer == nullptr || size < 4) return JSP_ERR_INVALID;
	const int half = size / 2;
	char *local = reinterpret_cast<char *>(buffer);
	char *remote = local + half;
	const int result = rtcGetSelectedCandidatePair(pc, local, half, remote, half);
	if (result < 0) return result;
	// Packed as "local\0remote\0".
	const size_t localSize = std::strlen(local) + 1;
	const size_t remoteSize = std::strlen(remote) + 1;
	std::memmove(local + localSize, remote, remoteSize);
	return static_cast<int32_t>(localSize + remoteSize);
}

JSP_EXPORT int32_t jsp_pc_close(int32_t pc) { return rtcClosePeerConnection(pc); }

JSP_EXPORT int32_t jsp_pc_delete(int32_t pc) {
	{
		std::lock_guard<std::mutex> lock(liveMutex);
		livePeers.erase(pc);
	}
	return rtcDeletePeerConnection(pc);
}

JSP_EXPORT int32_t jsp_dc_create(int32_t pc, const char *label, int32_t unordered, int32_t max_retransmits) {
	rtcDataChannelInit init;
	std::memset(&init, 0, sizeof(init));
	init.reliability.unordered = unordered != 0;
	init.reliability.unreliable = max_retransmits >= 0;
	init.reliability.maxRetransmits = max_retransmits >= 0 ? static_cast<unsigned int>(max_retransmits) : 0;
	const int dc = rtcCreateDataChannelEx(pc, label, &init);
	if (dc >= 0) {
		rtcSetUserPointer(dc, rtcGetUserPointer(pc));
		watchChannel(dc);
	}
	return dc;
}

JSP_EXPORT int32_t jsp_dc_send(int32_t dc, const uint8_t *data, int32_t size) {
	return rtcSendMessage(dc, reinterpret_cast<const char *>(data), size);
}

JSP_EXPORT int32_t jsp_dc_buffered_amount(int32_t dc) { return rtcGetBufferedAmount(dc); }

JSP_EXPORT int32_t jsp_dc_set_buffered_amount_low_threshold(int32_t dc, int32_t amount) {
	return rtcSetBufferedAmountLowThreshold(dc, amount);
}

JSP_EXPORT int32_t jsp_dc_close(int32_t dc) { return rtcClose(dc); }

JSP_EXPORT int32_t jsp_dc_delete(int32_t dc) { return rtcDeleteDataChannel(dc); }

} // extern "C"
