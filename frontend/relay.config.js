const path = require('path');
const { APP_PATH, OUT_PATH } = require('./constants');

module.exports = {
  src: APP_PATH,
  schema: path.join(OUT_PATH, 'schema.graphql'),
  language: 'typescript',
};
