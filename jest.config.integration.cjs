const base = require('./jest.config.base.cjs');

module.exports = {
  ...base,
  testRegex: 'tests/integration/.*\\.spec\\.ts$',
};
