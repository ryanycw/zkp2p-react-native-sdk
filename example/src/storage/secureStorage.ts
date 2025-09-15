import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Storage } from '../../../src';

// Example app adapter: implements the SDK's minimal Storage interface
export const authStorage: Storage = {
  async get(key: string) {
    try {
      const v = await AsyncStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  async put(key: string, value: unknown) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  async del(key: string) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {}
  },
  async getKeys() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return [...keys] as string[];
    } catch {
      return [] as string[];
    }
  },
};

export async function getCredentials<T = any>(key: string): Promise<T | null> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
