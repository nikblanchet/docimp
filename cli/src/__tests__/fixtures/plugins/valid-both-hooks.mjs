/**
 * Valid test plugin with both hooks.
 */
export default {
  name: 'test-both-hooks',
  version: '1.0.0',
  hooks: {
    beforeAccept: async (docstring, item, config) => {
      return { accept: true };
    },
    afterWrite: async (filepath, item) => {
      return { accept: true };
    },
  },
};
