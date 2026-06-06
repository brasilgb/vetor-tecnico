const appJson = require('./app.json');

const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '7709fd72-87d9-4319-91c4-e66b236eecdd';

module.exports = () => ({
  ...appJson.expo,
  owner: 'andersonbrodrigues',
  extra: {
    ...(appJson.expo.extra ?? {}),
    eas: {
      ...(appJson.expo.extra?.eas ?? {}),
      projectId: easProjectId,
    },
  },
});
