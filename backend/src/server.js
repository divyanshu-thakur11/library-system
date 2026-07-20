const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`Library/Cabin management API listening on port ${config.port} [${config.env}]`);
});
