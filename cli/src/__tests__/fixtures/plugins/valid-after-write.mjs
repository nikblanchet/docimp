/**
 * Valid test plugin with afterWrite hook only.
 */
export default {
  name: 'test-after-write',
  version: '1.0.0',
  hooks: {
    afterWrite: async (filepath, item) => {
      return { accept: true };
    },
  },
};
