// wrapper entrypoint – forward to the implementation under geolocate-app
// this keeps the code in one place so production (Vercel) and local dev are
// identical.  The real server is defined in ./geolocate-app/server.js

const app = require('./geolocate-app/server');
const PORT = process.env.PORT || 3000;

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('Server listening on port', PORT);
  });
}
