const OWNER = 'ColdstartLabs-ca';
const REPO = 'myimageupscaler.com';
const MIGRATIONS = 'supabase/migrations';
const PATHS = [
  'scripts/seo/seo-lock-gate.ts',
  '.github/workflows/deploy.yml',
  'content/seo-lock.json',
  MIGRATIONS,
];
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}`;
const HEADERS = {
  'user-agent': 'myimageupscaler-seo-digest',
  accept: 'application/vnd.github+json',
};
const TIMEOUT_MS = 15_000;

type Commit = { sha: string; html_url: string; commit: { message: string } };
type File = { filename: string; status?: string; patch?: string };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`GitHub request failed with HTTP ${res.status}: ${url}`);
  return (await res.json()) as T;
}

async function listCommits(path: string, since: string): Promise<Commit[]> {
  const commits: Commit[] = [];
  for (let page = 1; ; page++) {
    const batch = await getJson<Commit[]>(
      `${API}/commits?path=${encodeURIComponent(path)}&since=${encodeURIComponent(since)}&per_page=100&page=${page}`
    );
    commits.push(...batch);
    if (batch.length < 100) return commits;
  }
}

async function fileMentionsSeoLock(file: File, sha: string): Promise<boolean> {
  if (file.patch?.includes('seo_lock')) return true;
  if (file.status === 'removed') return false;
  const res = await fetch(`${RAW}/${sha}/${file.filename}`, {
    headers: { 'user-agent': HEADERS['user-agent'] },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Cannot inspect migration: HTTP ${res.status}`);
  return (await res.text()).includes('seo_lock');
}

async function migrationMentionsSeoLock(sha: string): Promise<boolean> {
  for (let page = 1; ; page++) {
    const detail = await getJson<{ files?: File[] }>(
      `${API}/commits/${sha}?per_page=100&page=${page}`
    );
    const files = detail.files ?? [];
    for (const file of files) {
      if (!file.filename.startsWith(`${MIGRATIONS}/`) || !file.filename.endsWith('.sql')) continue;
      if (await fileMentionsSeoLock(file, sha)) return true;
    }
    if (files.length < 100) return false;
  }
}

export async function listSeoGateCommits(since: Date): Promise<string[]> {
  const sinceIso = since.toISOString();
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const path of PATHS) {
    const commits = await listCommits(path, sinceIso);
    for (const commit of commits) {
      if (seen.has(commit.sha)) continue;
      if (path === MIGRATIONS && !(await migrationMentionsSeoLock(commit.sha))) continue;
      seen.add(commit.sha);
      rows.push(`${commit.html_url} ${commit.commit.message.split('\n')[0]}`);
    }
  }
  return rows;
}
