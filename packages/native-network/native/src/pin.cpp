// Keeps the library loaded for the life of the process. A runtime unloads a library when the last
// handle to it is closed, such as when the worker thread that loaded it exits, while
// libdatachannel's and libjuice's threads are still running code in it.
#include "jsp_native_network.h"

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace {

int anchor = 0;

void pinSelf() {
#ifdef _WIN32
	HMODULE module = nullptr;
	GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
	                   reinterpret_cast<LPCWSTR>(&anchor), &module);
#else
	Dl_info info;
	// A second handle that is never closed, opened no-delete where the platform has the flag.
	if (dladdr(&anchor, &info) != 0 && info.dli_fname != nullptr) {
#ifdef RTLD_NODELETE
		dlopen(info.dli_fname, RTLD_NOW | RTLD_NODELETE);
#else
		dlopen(info.dli_fname, RTLD_NOW);
#endif
	}
#endif
}

// Runs when the library is loaded, before any of its functions can be called.
struct Pin {
	Pin() { pinSelf(); }
} pin;

} // namespace
