import type { ElectronAPI } from '@/types/electron';

export function getElectronAPI(): ElectronAPI | undefined {
  return window.electronAPI;
}

export function isElectronAvailable() {
  return Boolean(getElectronAPI());
}
