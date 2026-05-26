import { useEffect, useState } from 'react';

declare const __APP_VERSION__: string;

const buildVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function getBuildAppVersion() {
  return buildVersion;
}

export function useAppVersion() {
  const [version, setVersion] = useState(buildVersion);

  useEffect(() => {
    const anyWin = window as unknown as {
      electronAPI?: {
        getAppVersion?: () => Promise<string>;
      };
    };

    if (!anyWin?.electronAPI?.getAppVersion) return;

    anyWin.electronAPI
      .getAppVersion()
      .then((value) => {
        if (value) setVersion(value);
      })
      .catch(() => {});
  }, []);

  return version;
}
