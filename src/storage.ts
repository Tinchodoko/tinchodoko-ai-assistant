import * as SecureStore from 'expo-secure-store';
import type { Credentials } from './exness';

const KEY = 'tinchodoko.exness.credentials';

export async function saveCredentials(c: Credentials) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(c));
}
export async function loadCredentials(): Promise<Credentials | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? JSON.parse(raw) as Credentials : null;
}