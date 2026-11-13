import { SUPABASE_URL, SUPABASE_KEY, ADMIN_EMAIL } from './config.js';

let client = null;

export function connect() {
  if (!window.supabase?.createClient) {
    throw new Error('Не удалось загрузить supabase-js');
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}

const toNode = (row) => ({
  id: row.id,
  parent: row.parent_id,
  label: row.label,
  info: row.info || '',
});

const toArticle = (row) => ({
  id: row.id,
  title: row.title,
  content: row.content || '',
  updatedAt: row.updated_at,
});

export async function fetchNodes() {
  const { data, error } = await client
    .from('nodes')
    .select('id,parent_id,label,info')
    .order('label');

  if (error) throw error;
  return (data || []).map(toNode);
}

export async function fetchArticles() {
  const { data, error } = await client
    .from('articles')
    .select('id,title,content,updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(toArticle);
}

export async function fetchSettings() {
  const { data, error } = await client
    .from('site_settings')
    .select('accent_color,theme,page_scale,brightness,animations_enabled')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;

  return data || {
    accent_color: '#e5484d',
    theme: 'standard',
    page_scale: 100,
    brightness: 100,
    animations_enabled: true,
  };
}

export async function saveSettings(settings) {
  const { error } = await client
    .from('site_settings')
    .upsert({ id: 1, ...settings });

  if (error) throw error;
}

export async function insertNode({ id, parent, label, info }) {
  const { error } = await client
    .from('nodes')
    .insert({ id, parent_id: parent, label, info });

  if (error) throw error;
}

export async function updateNode(id, { label, info }) {
  const { error } = await client
    .from('nodes')
    .update({ label, info })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteNodes(ids) {
  if (!ids.length) return;
  const { error } = await client.from('nodes').delete().in('id', ids);
  if (error) throw error;
}

export async function insertArticle({ id, title, content }) {
  const { error } = await client.from('articles').insert({ id, title, content });
  if (error) throw error;
}

export async function updateArticle(id, { title, content }) {
  const { error } = await client
    .from('articles')
    .update({ title, content, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteArticle(id) {
  const { error } = await client.from('articles').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchRelatedArticles(nodeId) {
  const { data: links, error: linksError } = await client
    .from('article_links')
    .select('article_id')
    .eq('node_id', nodeId);

  if (linksError) throw linksError;

  const ids = (links || []).map((link) => link.article_id);
  if (!ids.length) return [];

  const { data, error } = await client
    .from('articles')
    .select('id,title,content,updated_at')
    .in('id', ids)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(toArticle);
}

export async function fetchArticleLinks(articleId) {
  const { data, error } = await client
    .from('article_links')
    .select('node_id')
    .eq('article_id', articleId);

  if (error) throw error;
  return (data || []).map((link) => link.node_id);
}

export async function setArticleLinks(articleId, nodeIds) {
  const { error: deleteError } = await client
    .from('article_links')
    .delete()
    .eq('article_id', articleId);

  if (deleteError) throw deleteError;

  if (!nodeIds.length) return;

  const { error } = await client
    .from('article_links')
    .insert(nodeIds.map((nodeId) => ({ article_id: articleId, node_id: nodeId })));

  if (error) throw error;
}

export function isAdminSession(session) {
  const email = session?.user?.email;
  return Boolean(email) && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export async function currentSession() {
  const { data } = await client.auth.getSession();
  return data?.session ?? null;
}

export async function signIn(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export function watchAuth(handler) {
  return client.auth.onAuthStateChange((_event, session) => handler(session));
}
