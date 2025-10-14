/**
 * Valid test plugin with beforeAccept hook only.
 */
export default {
  name: 'test-before-accept',
  version: '1.0.0',
  hooks: {
    beforeAccept: async (docstring, item, config) => {
      return { accept: true };
    },
  },
};
