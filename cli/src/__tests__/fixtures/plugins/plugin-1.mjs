/**
 * First test plugin for multiple plugin testing.
 */
export default {
  name: 'plugin-1',
  version: '1.0.0',
  hooks: {
    beforeAccept: async () => ({ accept: true }),
  },
};
