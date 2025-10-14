/**
 * Invalid plugin - beforeAccept is not a function.
 */
export default {
  name: 'test',
  version: '1.0.0',
  hooks: {
    beforeAccept: 'not a function',
  },
};
