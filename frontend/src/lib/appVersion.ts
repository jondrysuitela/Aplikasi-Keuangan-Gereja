import { useEffect, useState } from 'react';
import { getElectronAPI } from '@/lib/electron';

declare const __APP_VERSION__: string;

const buildVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function getBuildAppVersion() {
  return buildVersion;
}

export function useAppVersion() {
  const [version, setVersion] = useState(buildVersion);

  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.getAppVersion) return;

    electronAPI.getAppVersion()
      .then((value) => {
        if (value) setVersion(value);
      })
      .catch(() => {});
  }, []);

  return version;
}
