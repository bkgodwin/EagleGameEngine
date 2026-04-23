const BASE_URL = '/api';

export function getToken() { return localStorage.getItem('eagle_token'); }
export function setToken(t) { localStorage.setItem('eagle_token', t); }
export function clearToken() { localStorage.removeItem('eagle_token'); }

function authHeaders() {
  const t = getToken();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
}

async function request(method, path, body, isForm = false) {
  const headers = { ...authHeaders() };
  let reqBody;
  if (body) {
    if (isForm) {
      reqBody = new URLSearchParams(body);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else {
      reqBody = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }
  const res = await fetch(BASE_URL + path, { method, headers, body: reqBody });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const login = (email, password) => request('POST', '/auth/login', { username: email, password }, true);
export const signup = (email, username, password) => request('POST', '/auth/signup', { email, username, password });
export const getMe = () => request('GET', '/auth/me');
export const changePassword = (oldPwd, newPwd) => request('POST', '/auth/change-password', { old_password: oldPwd, new_password: newPwd });

export const getProjects = () => request('GET', '/projects');
export const createProject = (name, data) => request('POST', '/projects', { name, data });
export const getProject = (id) => request('GET', `/projects/${id}`);
export const saveProject = (id, data) => request('PUT', `/projects/${id}`, data);
export const renameProject = (id, name) => request('PUT', `/projects/${id}`, { name });
export const deleteProject = (id) => request('DELETE', `/projects/${id}`);

export async function exportProject(id) {
  const res = await fetch(BASE_URL + `/projects/${id}/export`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `project_${id}.json`; a.click();
  URL.revokeObjectURL(url);
}

export const uploadAsset = (file) => {
  const form = new FormData(); form.append('file', file);
  return fetch(BASE_URL + '/assets/upload', { method: 'POST', headers: authHeaders(), body: form }).then(r => r.json());
};
export const getAssets = () => request('GET', '/assets');
export const getAssetLibrary = () => request('GET', '/assets/library');
export const deleteAsset = (id) => request('DELETE', `/assets/${id}`);

export const adminGetUsers = () => request('GET', '/admin/users');
export const adminUpdateUser = (id, data) => request('PUT', `/admin/users/${id}`, data);
export const adminDeleteUser = (id) => request('DELETE', `/admin/users/${id}`);
export const adminResetPassword = (id, newPwd) => request('POST', `/admin/users/${id}/reset-password`, { new_password: newPwd });
export const adminGetSettings = () => request('GET', '/admin/settings');
export const adminUpdateSettings = (settings) => request('PUT', '/admin/settings', settings);
export const adminGetStats = () => request('GET', '/admin/stats');

export const listRooms = () => request('GET', '/multiplayer/rooms');
export const spawnAIAgent = (roomId, data) => request('POST', `/rooms/${roomId}/ai/spawn`, data);
export const damageAIAgent = (roomId, agentId, amount) => request('POST', `/rooms/${roomId}/ai/${agentId}/damage`, { amount });
