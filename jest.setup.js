// AsyncStorage native module mock
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Reanimated mock (safe no-op for logic tests)
jest.mock('react-native-reanimated', () => {
  try {
    return require('react-native-reanimated/mock');
  } catch {
    return {};
  }
});
