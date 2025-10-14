/**
 * Invalid plugin - missing version property.
 */
export default {
  name: 'test',
  hooks: {
    beforeAccept: async () => ({ accept: true }),
  },
};
