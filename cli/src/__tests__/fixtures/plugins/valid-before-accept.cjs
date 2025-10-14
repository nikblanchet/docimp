/**
 * Valid test plugin with beforeAccept hook only (CommonJS version).
 */
module.exports = {
  name: 'test-before-accept-cjs',
  version: '1.0.0',
  hooks: {
    beforeAccept: async (docstring, item, config) => {
      return { accept: true };
    },
  },
};
