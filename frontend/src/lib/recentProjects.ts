const RECENT_PROJECTS_KEY = 'keuangan-gereja-recent-projects';
const MAX_RECENT_PROJECTS = 10;

export type RecentProject = {
  path: string;
  name: string;
  openedAt: string;
};

function projectNameFromPath(path: string) {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path;
}

function readRawRecentProjects(): RecentProject[] {
  try {
    const raw = window.localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentProject => Boolean(item?.path && item?.name && item?.openedAt))
      .slice(0, MAX_RECENT_PROJECTS);
  } catch {
    return [];
  }
}

function writeRecentProjects(items: RecentProject[]) {
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(items.slice(0, MAX_RECENT_PROJECTS)));
}

export function listRecentProjects() {
  return readRawRecentProjects();
}

export function addRecentProject(path?: string | null) {
  const cleanPath = String(path || '').trim();
  if (!cleanPath) return readRawRecentProjects();
  const next: RecentProject = {
    path: cleanPath,
    name: projectNameFromPath(cleanPath),
    openedAt: new Date().toISOString(),
  };
  const deduped = readRawRecentProjects().filter((item) => item.path !== cleanPath);
  const items = [next, ...deduped].slice(0, MAX_RECENT_PROJECTS);
  writeRecentProjects(items);
  return items;
}

export function removeRecentProject(path: string) {
  const items = readRawRecentProjects().filter((item) => item.path !== path);
  writeRecentProjects(items);
  return items;
}

export function clearRecentProjects() {
  writeRecentProjects([]);
  return [];
}
