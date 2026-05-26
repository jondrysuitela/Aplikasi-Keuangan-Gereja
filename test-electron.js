const { app } = require('electron');
console.log('app:', typeof app);
if (app) {
  console.log('READY');
  app.whenReady().then(() => {
    console.log('App ready');
    app.quit();
  });
} else {
  console.log('app is undefined');
  process.exit(1);
}
