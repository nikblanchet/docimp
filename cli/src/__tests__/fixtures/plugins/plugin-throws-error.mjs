/**
 * Test plugin that throws an error (for error isolation testing).
 */
export default {
  name: 'throws-error',
  version: '1.0.0',
  hooks: {
    beforeAccept: async (docstring, item, config) => {
      throw new Error('Plugin crashed');
    },
  },
};
