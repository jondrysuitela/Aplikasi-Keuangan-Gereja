// bootstrap.js - Entry point for Electron app
// This patches Module._load BEFORE the main app code runs,
// so that require('electron') returns the actual APIs instead of the path string.
const Module = require('module');
const originalLoad = Module._load;

// We need to access the electron APIs through the native module system.
// The 'electron' module name is special in Electron - it should be resolved
// through the native module loader, not the npm package.
//
// In Electron's native code, when 'electron' is required, the Module._load
// should be patched to return the actual APIs. Since this patch doesn't work
// on Windows (known bug), we need to do it ourselves.
//
// The trick: we check if we're inside the Electron main process by checking
// process.versions.electron. If so, we use the internal module resolution
// which Electron's native code has set up.

Module._load = function(request, parent, isMain) {
  if (request === 'electron') {
    // Try to get the electron module from the native loader.
    // The native code sets up electron APIs in a special internal module.
    // We try multiple approaches:

    // Approach 1: Try loading as a built-in module
    try {
      return process._linkedBinding('electron_browser_main');
    } catch(e) {}

    // Approach 2: Use the internal electron module
    try {
      return originalLoad.call(this, 'electron/src/main/module');
    } catch(e) {}

    // Approach 3: Return undefined values for all properties
    // This is a last resort - the app will crash but at least with
    // a clearer error message
    return new Proxy({}, {
      get(target, prop) {
        throw new Error(`Electron API '${String(prop)}' is not available. This is a known Windows bug in Electron 22+. See https://github.com/electron/electron/issues/49034`);
      }
    });
  }
  return originalLoad.apply(this, arguments);
};

// Now load the actual main.js
require('./electron/main.js');
