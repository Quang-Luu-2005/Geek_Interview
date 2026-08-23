const base = require('./jest.config.base.cjs');

module.exports = {
  ...base,
  testRegex: 'tests/concurrency/.*\\.spec\\.ts$',
};
