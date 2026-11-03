// GitHub simulado em memória (Git Data API mínima) para testar o Worker sem rede.
// Instala-se como globalThis.fetch e responde em http://gh.local/repos/test/repo/...
export function fakeGithub(seedFiles) {
  let n = 0;
  const trees = new Map();
  const commits = new Map();
  const blobs = new Map();
  trees.set('t0', new Map(Object.entries(seedFiles)));
  commits.set('c0', { tree: 't0', parents: [] });
  const state = { head: 'c0', lastTree: [] };
  const ok = (body, text) => new Response(text ?? JSON.stringify(body), { status: 200 });
  const fail = (s) => new Response('{}', { status: s });
  const asText = (f) => (typeof f === 'string' || f === undefined ? f : f.encoding === 'utf-8' ? f.content : null);

  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const p = u.pathname.replace('/repos/test/repo', '');
    const body = init.body ? JSON.parse(init.body) : null;
    if (init.headers?.Authorization !== 'Bearer ghp_test') return fail(401);
    let m;
    if (p === '/git/ref/heads/main') return ok({ object: { sha: state.head } });
    if ((m = p.match(/^\/git\/commits\/(\w+)$/)) && !init.method) return ok({ tree: { sha: commits.get(m[1]).tree } });
    if ((m = p.match(/^\/contents\/(.+)$/))) {
      const f = trees.get(commits.get(u.searchParams.get('ref')).tree).get(m[1]);
      const text = typeof f === 'string' || f === undefined ? f : f.encoding === 'utf-8' ? f.content : atob(f.content);
      return text === undefined ? fail(404) : ok(null, text);
    }
    if (p === '/git/blobs') {
      const sha = `b${++n}`;
      blobs.set(sha, body);
      return ok({ sha });
    }
    if (p === '/git/trees') {
      state.lastTree = body.tree.map((e) => e.path);
      const files = new Map(trees.get(body.base_tree));
      for (const e of body.tree) files.set(e.path, blobs.get(e.sha));
      const sha = `t${++n}`;
      trees.set(sha, files);
      return ok({ sha });
    }
    if (p === '/git/commits') {
      const sha = `c${++n}`;
      commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
      return ok({ sha });
    }
    if (p === '/git/refs/heads/main') {
      if (commits.get(body.sha).parents[0] !== state.head) return fail(422);
      state.head = body.sha;
      return ok({});
    }
    return fail(404);
  };

  state.file = (f, sha = state.head) => {
    const v = trees.get(commits.get(sha).tree).get(f);
    return typeof v === 'string' ? v : v?.encoding === 'utf-8' ? v.content : v;
  };
  // conteúdo binário/texto do último estado, para o servidor de teste
  state.bytes = (f) => {
    const v = trees.get(commits.get(state.head).tree).get(f);
    if (v === undefined) return null;
    if (typeof v === 'string') return Buffer.from(v, 'utf8');
    return v.encoding === 'utf-8' ? Buffer.from(v.content, 'utf8') : Buffer.from(v.content, 'base64');
  };
  state.commit = (sha = state.head) => commits.get(sha);
  state.asText = asText;
  return state;
}
