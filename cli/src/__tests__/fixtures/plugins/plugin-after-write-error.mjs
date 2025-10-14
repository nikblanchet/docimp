/**
 * Test plugin that throws an error in afterWrite hook.
 */
export default {
  name: 'after-write-error',
  version: '1.0.0',
  hooks: {
    afterWrite: async (filepath, item) => {
      throw new Error('After write failed');
    },
  },
};
