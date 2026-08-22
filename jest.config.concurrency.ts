import base from './jest.config';

export default {
  ...base,
  testRegex: 'tests/concurrency/.*\\.spec\\.ts$',
};
