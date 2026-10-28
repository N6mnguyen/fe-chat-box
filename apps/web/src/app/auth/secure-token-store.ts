import { InjectionToken } from '@angular/core';

/**
 * Browser/PWA adapter is intentionally memory-only. Production web deployments
 * should prefer secure, HttpOnly cookies; Electron should use safeStorage over IPC.
 */
export interface SecureTokenStore {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  getDeviceToken(): Promise<string | null>;
  setDeviceToken(token: string): Promise<void>;
  clear(): Promise<void>;
}

export const SECURE_TOKEN_STORE = new InjectionToken<SecureTokenStore>('SECURE_TOKEN_STORE');

export class InMemorySecureTokenStore implements SecureTokenStore {
  private refreshToken: string | null = null;
  private deviceToken: string | null = null;

  async getRefreshToken(): Promise<string | null> {
    return this.refreshToken;
  }

  async setRefreshToken(token: string): Promise<void> {
    this.refreshToken = token;
  }

  async getDeviceToken(): Promise<string | null> {
    return this.deviceToken;
  }

  async setDeviceToken(token: string): Promise<void> {
    this.deviceToken = token;
  }

  async clear(): Promise<void> {
    this.refreshToken = null;
    this.deviceToken = null;
  }
}

export interface ElectronSecureStorageBridge {
  getToken(kind: 'refresh' | 'device'): Promise<string | null>;
  setToken(kind: 'refresh' | 'device', token: string): Promise<void>;
  clearTokens(): Promise<void>;
}

export const ELECTRON_SECURE_STORAGE_BRIDGE =
  new InjectionToken<ElectronSecureStorageBridge>('ELECTRON_SECURE_STORAGE_BRIDGE');

/** Adapter for a preload/contextBridge API backed by Electron safeStorage via IPC. */
export class ElectronSecureTokenStore implements SecureTokenStore {
  constructor(private readonly bridge: ElectronSecureStorageBridge) {}

  getRefreshToken(): Promise<string | null> {
    return this.bridge.getToken('refresh');
  }

  setRefreshToken(token: string): Promise<void> {
    return this.bridge.setToken('refresh', token);
  }

  getDeviceToken(): Promise<string | null> {
    return this.bridge.getToken('device');
  }

  setDeviceToken(token: string): Promise<void> {
    return this.bridge.setToken('device', token);
  }

  clear(): Promise<void> {
    return this.bridge.clearTokens();
  }
}
