export async function api(path, options = {}, token = localStorage.getItem('mgla-key')) {
  let response;
  try { response = await fetch('/api/' + path, {...options, headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + (token || ''), ...options.headers}}); }
  catch { throw new Error('Сервер недоступен. Проверьте подключение и повторите.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос.');
  return data;
}
export const post = (body) => ({method:'POST',body:JSON.stringify(body)});
