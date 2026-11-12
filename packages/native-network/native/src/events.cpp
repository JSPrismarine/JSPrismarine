#include "events.hpp"

#include "jsp_native_network.h"
#include "socket.hpp"

#include <cstring>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <vector>

namespace jsp {

namespace {

struct Queue {
	std::mutex mutex;
	std::deque<std::vector<uint8_t>> events;
	// Set once a wake is on its way, and cleared by the read that finds the queue empty, so a
	// burst of events costs one wake however long it is.
	bool wakePending = false;
	bool open = true;
	jsp_socket_t socket = JSP_INVALID_SOCKET;
	uint16_t port = 0;
};

// Never destroyed: libdatachannel's threads can call in while the process exits, after static
// destructors would have run, so these outlive everything rather than race it.
std::mutex &queuesMutex = *new std::mutex;
std::map<int32_t, std::shared_ptr<Queue>> &queues = *new std::map<int32_t, std::shared_ptr<Queue>>;
int32_t nextQueue = 1;
int32_t logQueue = 0;
// The queue the calling thread opened, if any. A line logged during a call goes to the queue of
// the thread that made it, so a failed call can read what it logged; lines from libdatachannel's
// own threads go to logQueue.
thread_local int32_t threadQueue = 0;

std::shared_ptr<Queue> findQueue(int32_t handle) {
	std::lock_guard<std::mutex> lock(queuesMutex);
	auto found = queues.find(handle);
	return found == queues.end() ? nullptr : found->second;
}

void writeU32(uint8_t *at, uint32_t value) {
	at[0] = static_cast<uint8_t>(value);
	at[1] = static_cast<uint8_t>(value >> 8);
	at[2] = static_cast<uint8_t>(value >> 16);
	at[3] = static_cast<uint8_t>(value >> 24);
}

} // namespace

void pushEvent2(int32_t handle, uint8_t kind, int32_t id, int32_t value, const void *first, size_t firstSize,
                const void *second, size_t secondSize) {
	std::shared_ptr<Queue> queue = findQueue(handle);
	if (!queue) return;

	const size_t total = JSP_EVENT_HEADER_BYTES + firstSize + secondSize;
	std::vector<uint8_t> event(total);
	writeU32(event.data(), static_cast<uint32_t>(total));
	event[4] = kind;
	writeU32(event.data() + 8, static_cast<uint32_t>(id));
	writeU32(event.data() + 12, static_cast<uint32_t>(value));
	if (firstSize > 0) std::memcpy(event.data() + JSP_EVENT_HEADER_BYTES, first, firstSize);
	if (secondSize > 0) std::memcpy(event.data() + JSP_EVENT_HEADER_BYTES + firstSize, second, secondSize);

	bool wake = false;
	{
		std::lock_guard<std::mutex> lock(queue->mutex);
		if (!queue->open) return;
		queue->events.push_back(std::move(event));
		if (!queue->wakePending) {
			queue->wakePending = true;
			wake = true;
		}
		// Sent under the queue's lock, so a close cannot free the socket in between.
		if (wake) sendWake(queue->socket, queue->port);
	}
}

void pushEvent(int32_t handle, uint8_t kind, int32_t id, int32_t value, const void *payload, size_t payloadSize) {
	pushEvent2(handle, kind, id, value, payload, payloadSize, nullptr, 0);
}

void pushLog(int32_t level, const char *line, size_t size) {
	int32_t handle;
	{
		std::lock_guard<std::mutex> lock(queuesMutex);
		handle = threadQueue != 0 && queues.count(threadQueue) != 0 ? threadQueue : logQueue;
	}
	if (handle != 0) pushEvent(handle, JSP_EVENT_LOG, 0, level, line, size);
}

int32_t openQueue(uint16_t port, bool wantsLogs) {
	auto queue = std::make_shared<Queue>();
	queue->socket = openLoopbackSocket();
	if (queue->socket == JSP_INVALID_SOCKET) return 0;
	queue->port = port;
	std::lock_guard<std::mutex> lock(queuesMutex);
	const int32_t handle = nextQueue++;
	queues.emplace(handle, queue);
	if (wantsLogs) logQueue = handle;
	threadQueue = handle;
	return handle;
}

bool queueOpen(int32_t handle) { return findQueue(handle) != nullptr; }

void closeQueue(int32_t handle) {
	std::shared_ptr<Queue> queue;
	{
		std::lock_guard<std::mutex> lock(queuesMutex);
		auto found = queues.find(handle);
		if (found == queues.end()) return;
		queue = found->second;
		queues.erase(found);
		if (logQueue == handle) logQueue = 0;
	}
	std::lock_guard<std::mutex> lock(queue->mutex);
	queue->open = false;
	queue->events.clear();
	closeSocket(queue->socket);
	queue->socket = JSP_INVALID_SOCKET;
}

void closeQueues() {
	std::vector<int32_t> handles;
	{
		std::lock_guard<std::mutex> lock(queuesMutex);
		for (const auto &entry : queues) handles.push_back(entry.first);
	}
	for (int32_t handle : handles) closeQueue(handle);
}

} // namespace jsp

extern "C" JSP_EXPORT int32_t jsp_events_read(int32_t handle, uint8_t *buffer, int32_t size) {
	if (buffer == nullptr || size < 0) return JSP_ERR_INVALID;
	std::shared_ptr<jsp::Queue> queue = jsp::findQueue(handle);
	if (!queue) return JSP_ERR_INVALID;
	std::lock_guard<std::mutex> lock(queue->mutex);
	int32_t written = 0;
	while (!queue->events.empty()) {
		const std::vector<uint8_t> &event = queue->events.front();
		const int32_t eventSize = static_cast<int32_t>(event.size());
		if (eventSize > size - written) {
			// Nothing written yet means the buffer can never hold this event.
			return written == 0 ? -eventSize : written;
		}
		std::memcpy(buffer + written, event.data(), event.size());
		written += eventSize;
		queue->events.pop_front();
	}
	if (written == 0) queue->wakePending = false;
	return written;
}
