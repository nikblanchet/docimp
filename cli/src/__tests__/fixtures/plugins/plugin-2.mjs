/**
 * Second test plugin for multiple plugin testing.
 */
export default {
  name: 'plugin-2',
  version: '1.0.0',
  hooks: {
    beforeAccept: async () => ({ accept: true }),
  },
};
