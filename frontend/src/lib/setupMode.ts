export function shouldRequireInitialSetup(setupCompleted: boolean) {
  if (import.meta.env.DEV) return false;
  return !setupCompleted;
}

export function isSetupBypassedForDev() {
  return import.meta.env.DEV;
}
