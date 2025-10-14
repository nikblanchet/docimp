/**
 * Invalid plugin - missing name property.
 */
export default {
  version: '1.0.0',
  hooks: {
    beforeAccept: async () => ({ accept: true }),
  },
};
