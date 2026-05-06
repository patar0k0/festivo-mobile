import Constants from 'expo-constants';

/** True when running in the Expo Go client (no custom native binary; remote push unavailable). */
export const isExpoGo = Constants.appOwnership === 'expo';
