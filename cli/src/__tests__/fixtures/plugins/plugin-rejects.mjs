/**
 * Test plugin that rejects documentation.
 */
export default {
  name: 'rejects-all',
  version: '1.0.0',
  hooks: {
    beforeAccept: async (docstring, item, config) => {
      return {
        accept: false,
        reason: 'Documentation is invalid',
      };
    },
  },
};
