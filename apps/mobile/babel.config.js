module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // react-native-reanimated 4.x moved its worklets transform into the
    // standalone `react-native-worklets` package, so the Babel plugin is
    // `react-native-worklets/plugin` (reanimated's own
    // `react-native-reanimated/plugin` is now just a thin re-export of it).
    // It MUST be the LAST plugin so it runs after every other transform.
    plugins: ['react-native-worklets/plugin'],
  };
};
