// A UDP port RakNet shares with NetherNet (ADR 0008). libjuice owns the socket; the hooks the
// libjuice patch adds classify each datagram on libjuice's thread before its address lookup, and
// RakNet's datagrams cross to the runtime through rings, with one wake per batch.
#include "jsp_native_network.h"
#include "ring.hpp"
#include "socket.hpp"

#include <juice/juice.h>

#include <array>
#include <atomic>
#include <cstring>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

// family, reserved, port (little-endian), 16 address bytes; an IPv4 address fills the first 4.
constexpr uint32_t DATAGRAM_HEADER_BYTES = 20;
constexpr uint32_t MAX_DATAGRAM_BYTES = 65536;

struct FamilyRings {
	jsp::Ring inbound;
	jsp::Ring outbound;
	uint16_t wakePort = 0;
	bool attached = false;
};

struct Mux {
	int port = 0;
	std::string bindAddress;
	std::array<std::atomic<int32_t>, JSP_MUX_STAT_COUNT> stats{};
	// Lock order: libjuice's mux mode, then its registry, then ringsMutex. The outbound thread
	// takes only outboundMutex before it sends, which takes libjuice's mux mode, so it never
	// holds ringsMutex while it waits on libjuice.
	std::mutex ringsMutex;
	std::mutex outboundMutex;
	FamilyRings v4;
	FamilyRings v6;
	jsp_socket_t control = JSP_INVALID_SOCKET;
	uint16_t controlPort = 0;
	std::atomic<bool> stopping{false};
	std::thread outboundThread;

	void count(int stat) { stats[static_cast<size_t>(stat)].fetch_add(1, std::memory_order_relaxed); }

	// Closed ports stop their thread first; a joinable std::thread would terminate the process.
	~Mux() {
		if (outboundThread.joinable()) outboundThread.detach();
	}
};

// Never destroyed: libjuice's mux thread holds a port's hooks until they are removed, and a port
// still open at exit must not be freed under it.
std::mutex &muxesMutex = *new std::mutex;
std::map<int32_t, std::unique_ptr<Mux>> &muxes = *new std::map<int32_t, std::unique_ptr<Mux>>;
int32_t nextHandle = 1;

Mux *findMux(int32_t handle) {
	auto found = muxes.find(handle);
	return found == muxes.end() ? nullptr : found->second.get();
}

void writeHeader(uint8_t *header, const sockaddr *address) {
	std::memset(header, 0, DATAGRAM_HEADER_BYTES);
	if (address->sa_family == AF_INET) {
		const auto *in = reinterpret_cast<const sockaddr_in *>(address);
		const uint16_t port = ntohs(in->sin_port);
		header[0] = 4;
		header[2] = static_cast<uint8_t>(port);
		header[3] = static_cast<uint8_t>(port >> 8);
		std::memcpy(header + 4, &in->sin_addr, 4);
	} else {
		const auto *in6 = reinterpret_cast<const sockaddr_in6 *>(address);
		const uint16_t port = ntohs(in6->sin6_port);
		header[0] = 6;
		header[2] = static_cast<uint8_t>(port);
		header[3] = static_cast<uint8_t>(port >> 8);
		std::memcpy(header + 4, &in6->sin6_addr, 16);
	}
}

// Copies one RakNet datagram into its family's inbound ring and wakes the consumer if it was idle.
void deliverToRakNet(Mux *mux, const char *data, size_t size, const void *source, size_t sourceSize) {
	if (sourceSize < sizeof(sockaddr) || size > MAX_DATAGRAM_BYTES) return;
	const auto *address = static_cast<const sockaddr *>(source);
	uint8_t header[DATAGRAM_HEADER_BYTES];
	writeHeader(header, address);

	uint16_t wakePort = 0;
	{
		std::lock_guard<std::mutex> lock(mux->ringsMutex);
		FamilyRings &rings = header[0] == 4 ? mux->v4 : mux->v6;
		if (!rings.attached) {
			mux->count(JSP_MUX_STAT_NO_RING);
			return;
		}
		if (!rings.inbound.write(header, DATAGRAM_HEADER_BYTES, reinterpret_cast<const uint8_t *>(data),
		                         static_cast<uint32_t>(size))) {
			mux->count(JSP_MUX_STAT_RING_FULL);
			return;
		}
		if (rings.inbound.claimWake()) wakePort = rings.wakePort;
	}
	if (wakePort != 0) {
		jsp::sendWake(mux->control, wakePort);
		mux->count(JSP_MUX_STAT_WAKES);
	}
}

int filter(const char *data, size_t size, const void *source, size_t sourceSize, void *user) {
	auto *mux = static_cast<Mux *>(user);
	const int32_t cls = jsp_classify(reinterpret_cast<const uint8_t *>(data), static_cast<int32_t>(size));
	if (cls == JSP_CLASS_RAKNET || cls == JSP_CLASS_RAKNET_OFFLINE) {
		mux->count(JSP_MUX_STAT_RAKNET);
		deliverToRakNet(mux, data, size, source, sourceSize);
		return 1;
	}
	mux->count(JSP_MUX_STAT_PASSED);
	return 0;
}

void unhandled(const char *data, size_t size, const void *source, size_t sourceSize, void *user) {
	auto *mux = static_cast<Mux *>(user);
	// STUN and DTLS that no peer claims are not RakNet's; only an unsure datagram may be.
	if (jsp_classify(reinterpret_cast<const uint8_t *>(data), static_cast<int32_t>(size)) != JSP_CLASS_UNSURE) {
		mux->count(JSP_MUX_STAT_UNHANDLED_DROPPED);
		return;
	}
	mux->count(JSP_MUX_STAT_UNHANDLED_RAKNET);
	deliverToRakNet(mux, data, size, source, sourceSize);
}

// Sends what RakNet wrote into one outbound ring, from the mux socket.
void drainOutbound(Mux *mux, jsp::Ring &ring, std::vector<uint8_t> &buffer) {
	ring.clearWake();
	for (;;) {
		const int64_t length = ring.read(buffer.data(), static_cast<uint32_t>(buffer.size()));
		if (length == 0) return;
		if (length < 0) {
			buffer.resize(static_cast<size_t>(-length));
			continue;
		}
		if (length < static_cast<int64_t>(DATAGRAM_HEADER_BYTES)) continue;
		const uint8_t *header = buffer.data();
		const uint16_t port = static_cast<uint16_t>(header[2] | (header[3] << 8));
		const char *payload = reinterpret_cast<const char *>(buffer.data() + DATAGRAM_HEADER_BYTES);
		const size_t payloadSize = static_cast<size_t>(length) - DATAGRAM_HEADER_BYTES;
		int sent;
		if (header[0] == 4) {
			sockaddr_in to;
			std::memset(&to, 0, sizeof(to));
			to.sin_family = AF_INET;
			to.sin_port = htons(port);
			std::memcpy(&to.sin_addr, header + 4, 4);
			sent = juice_mux_sendto(mux->port, payload, payloadSize, &to, sizeof(to));
		} else {
			sockaddr_in6 to;
			std::memset(&to, 0, sizeof(to));
			to.sin6_family = AF_INET6;
			to.sin6_port = htons(port);
			std::memcpy(&to.sin6_addr, header + 4, 16);
			sent = juice_mux_sendto(mux->port, payload, payloadSize, &to, sizeof(to));
		}
		mux->count(sent < 0 ? JSP_MUX_STAT_SEND_FAILED : JSP_MUX_STAT_SENT);
	}
}

void runOutbound(Mux *mux) {
	std::vector<uint8_t> buffer(MAX_DATAGRAM_BYTES + DATAGRAM_HEADER_BYTES);
	while (jsp::receiveWake(mux->control) >= 0) {
		if (mux->stopping.load()) return;
		std::lock_guard<std::mutex> lock(mux->outboundMutex);
		if (mux->v4.attached) drainOutbound(mux, mux->v4.outbound, buffer);
		if (mux->v6.attached) drainOutbound(mux, mux->v6.outbound, buffer);
	}
}

void stopMux(Mux *mux) {
	juice_mux_set_hooks(mux->bindAddress.empty() ? nullptr : mux->bindAddress.c_str(), mux->port, nullptr);
	mux->stopping.store(true);
	jsp::sendWake(mux->control, mux->controlPort);
	if (mux->outboundThread.joinable()) mux->outboundThread.join();
	jsp::closeSocket(mux->control);
	mux->control = JSP_INVALID_SOCKET;
}

} // namespace

namespace jsp {
void closeMuxes() {
	std::map<int32_t, std::unique_ptr<Mux>> closing;
	{
		std::lock_guard<std::mutex> lock(muxesMutex);
		closing.swap(muxes);
	}
	for (auto &entry : closing) stopMux(entry.second.get());
}
} // namespace jsp

extern "C" {

JSP_EXPORT int32_t jsp_mux_open(const char *bind_address, int32_t port) {
	if (port <= 0 || port > 65535) return JSP_ERR_INVALID;
	// A wildcard mux is libjuice's dual-stack socket; refuse a port another program holds for IPv4.
	if ((bind_address == nullptr || bind_address[0] == '\0') && !jsp::ipv4PortFree(static_cast<uint16_t>(port)))
		return JSP_ERR_BIND;
	auto mux = std::make_unique<Mux>();
	mux->port = port;
	mux->bindAddress = bind_address == nullptr ? "" : bind_address;
	mux->control = jsp::openLoopbackSocket();
	if (mux->control == JSP_INVALID_SOCKET) return JSP_ERR_FAILURE;
	mux->controlPort = jsp::boundPort(mux->control);

	juice_mux_hooks_t hooks;
	hooks.filter = filter;
	hooks.unhandled = unhandled;
	hooks.user_ptr = mux.get();
	if (juice_mux_set_hooks(mux->bindAddress.empty() ? nullptr : mux->bindAddress.c_str(), port, &hooks) != 0) {
		jsp::closeSocket(mux->control);
		return JSP_ERR_BIND;
	}

	Mux *raw = mux.get();
	raw->outboundThread = std::thread(runOutbound, raw);
	std::lock_guard<std::mutex> lock(muxesMutex);
	const int32_t handle = nextHandle++;
	muxes.emplace(handle, std::move(mux));
	return handle;
}

JSP_EXPORT int32_t jsp_mux_attach(int32_t handle, int32_t family, uint8_t *inbound, int32_t inbound_size,
                                  uint8_t *outbound, int32_t outbound_size, int32_t wake_port) {
	if ((family != 4 && family != 6) || wake_port <= 0 || wake_port > 65535) return JSP_ERR_INVALID;
	std::lock_guard<std::mutex> lock(muxesMutex);
	Mux *mux = findMux(handle);
	if (mux == nullptr) return JSP_ERR_INVALID;
	std::lock_guard<std::mutex> outboundLock(mux->outboundMutex);
	std::lock_guard<std::mutex> ringsLock(mux->ringsMutex);
	FamilyRings &rings = family == 4 ? mux->v4 : mux->v6;
	jsp::Ring in;
	jsp::Ring out;
	if (!in.attach(inbound, inbound_size) || !out.attach(outbound, outbound_size)) return JSP_ERR_INVALID;
	rings.inbound = in;
	rings.outbound = out;
	rings.wakePort = static_cast<uint16_t>(wake_port);
	rings.attached = true;
	return mux->controlPort;
}

JSP_EXPORT int32_t jsp_mux_detach(int32_t handle, int32_t family) {
	std::lock_guard<std::mutex> lock(muxesMutex);
	Mux *mux = findMux(handle);
	if (mux == nullptr || (family != 4 && family != 6)) return JSP_ERR_INVALID;
	std::lock_guard<std::mutex> outboundLock(mux->outboundMutex);
	std::lock_guard<std::mutex> ringsLock(mux->ringsMutex);
	(family == 4 ? mux->v4 : mux->v6) = FamilyRings();
	return 0;
}

JSP_EXPORT int32_t jsp_mux_close(int32_t handle) {
	std::unique_ptr<Mux> mux;
	{
		std::lock_guard<std::mutex> lock(muxesMutex);
		auto found = muxes.find(handle);
		if (found == muxes.end()) return JSP_ERR_INVALID;
		mux = std::move(found->second);
		muxes.erase(found);
	}
	stopMux(mux.get());
	return 0;
}

JSP_EXPORT int32_t jsp_mux_stats(int32_t handle, int32_t *out, int32_t count) {
	if (out == nullptr || count < 0) return JSP_ERR_INVALID;
	std::lock_guard<std::mutex> lock(muxesMutex);
	Mux *mux = findMux(handle);
	if (mux == nullptr) return JSP_ERR_INVALID;
	const int32_t written = count < JSP_MUX_STAT_COUNT ? count : JSP_MUX_STAT_COUNT;
	for (int32_t i = 0; i < written; ++i) out[i] = mux->stats[static_cast<size_t>(i)].load();
	return written;
}

} // extern "C"
