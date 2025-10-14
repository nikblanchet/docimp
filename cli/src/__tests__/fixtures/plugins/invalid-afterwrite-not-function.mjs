/**
 * Invalid plugin - afterWrite is not a function.
 */
export default {
  name: 'test',
  version: '1.0.0',
  hooks: {
    afterWrite: 'not a function',
  },
};
