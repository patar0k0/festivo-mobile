// AsyncStorage native module mock
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// @expo/vector-icons loads fonts via async setState, which triggers act() warnings
// in tests. Render icons as a simple host element instead.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const makeIcon = () => (props) => React.createElement(Text, props, null);
  return new Proxy(
    {},
    {
      get: (_target, key) => (key === '__esModule' ? false : makeIcon()),
    },
  );
});

// Reanimated mock (safe no-op for logic tests)
jest.mock('react-native-reanimated', () => {
  try {
    return require('react-native-reanimated/mock');
  } catch {
    return {};
  }
});
