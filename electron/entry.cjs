// CJS bootstrap also allows desktop test tools to initialize Electron before
// the ESM application is loaded. Keep startup failures visible in diagnostics.
import('./main.mjs').catch(error => {
  console.error('MuseCode failed to start:', error);
  require('electron').app.exit(1);
});
