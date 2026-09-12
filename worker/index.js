/**
 * Cloudflare Worker: 带密码的订阅导航页 + 私有仓库文件代理
 *
 * 需要的 Secret:
 *   GITHUB_TOKEN  — GitHub PAT (classic, repo scope), 形如 ghp_xxx   [必填]
 *   SITE_KEY                    [可选]
 *
 *   Dashboard: Worker → Settings → Variables and Secrets
 *   CLI:       wrangler secret put GITHUB_TOKEN   (SITE_KEY 同理)
 *
 * 访问:
 *   https://<worker>.<subdomain>.workers.dev/            → 输入密码后看所有链接
 *   https://<worker>.<subdomain>.workers.dev/v2ray.txt?key=chenli12
 */

const OWNER = "chenlee86";
const REPO = "freesub";
const BRANCH = "main";
const DEFAULT_KEY = "chenli12";

const COUNTRIES = [
  "AE", "AU", "BG", "CA", "CY", "DE", "DK", "EE", "ES", "FI", "FR", "GB",
  "HK", "ID", "IN", "IT", "JP", "KR", "KZ", "LV", "MY", "NL", "NO", "PL",
  "RU", "SC", "SE", "SG", "TH", "TR", "TW", "US", "ZA", "OTHER",
];
const RESI_COUNTRIES = ["HK", "KR", "TW", "US"];

export default {
  async fetch(request, env) {
    const SITE_KEY = env.SITE_KEY || DEFAULT_KEY;
    const url = new URL(request.url);
    const key =
      url.searchParams.get("key") || getCookie(request, "key") || "";
    const authed = key === SITE_KEY;

    // 首页 / 导航页
    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (!authed) {
        return html(loginPage(url.searchParams.has("key")), 401);
      }
      const headers = {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": `key=${encodeURIComponent(SITE_KEY)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`,
      };
      return new Response(indexPage(url.origin, SITE_KEY), { headers });
    }

    // 文件代理 — 必须带正确密码
    if (!authed) {
      return new Response("Forbidden: missing or wrong ?key=", { status: 403 });
    }
    if (!env.GITHUB_TOKEN) {
      return new Response("Missing GITHUB_TOKEN secret", { status: 500 });
    }

    const ghUrl =
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/output` +
      url.pathname;

    const res = await fetch(ghUrl, {
      headers: {
        Authorization: "token " + env.GITHUB_TOKEN,
        "User-Agent": "Cloudflare-Worker",
        Accept: "application/vnd.github.raw",
      },
    });
    if (!res.ok) return new Response("Not Found", { status: 404 });

    return new Response(await res.text(), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};

function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function loginPage(wrong) {
  return `<!doctype html><html lang="zh"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>订阅导航</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0f1115;color:#e6e6e6;
    display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  form{background:#1a1d24;padding:32px;border-radius:12px;width:280px;box-shadow:0 8px 30px rgba(0,0,0,.4)}
  h1{font-size:16px;margin:0 0 16px}
  input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #333;
    background:#0f1115;color:#e6e6e6;font-size:14px}
  button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#3b82f6;
    color:#fff;font-size:14px;cursor:pointer}
  .err{color:#f87171;font-size:12px;margin-top:8px}
</style>
<form method="get" action="/">
  <h1>输入访问密码</h1>
  <input type="password" name="key" placeholder="密码" autofocus>
  <button type="submit">进入</button>
  ${wrong ? '<div class="err">密码错误</div>' : ""}
</form>
</html>`;
}

function indexPage(origin, key) {
  const q = "?key=" + encodeURIComponent(key);
  const groups = [];

  groups.push({
    title: "全部节点",
    items: [
      ["V2RayN / 通用", "/v2ray.txt"],
      ["Clash / Mihomo", "/clash.yaml"],
      ["sing-box", "/singbox.json"],
    ],
  });
  groups.push({
    title: "仅住宅 IP",
    items: [
      ["V2RayN", "/residential.txt"],
      ["Clash", "/residential-clash.yaml"],
      ["sing-box", "/residential-singbox.json"],
    ],
  });
  groups.push({
    title: "分国家 · 仅住宅 IP",
    items: RESI_COUNTRIES.flatMap((c) => [
      [c + " · V2RayN", `/residential-by-country/${c}.txt`],
      [c + " · Clash", `/residential-by-country/clash-${c}.yaml`],
      [c + " · sing-box", `/residential-by-country/singbox-${c}.json`],
    ]),
  });
  groups.push({
    title: "分国家 · 全部节点",
    items: COUNTRIES.flatMap((c) => [
      [c + " · V2RayN", `/by-country/${c}.txt`],
      [c + " · Clash", `/by-country/clash-${c}.yaml`],
      [c + " · sing-box", `/by-country/singbox-${c}.json`],
    ]),
  });

  const section = (g) => `
    <h2>${g.title}</h2>
    <ul>${g.items
      .map(([label, path]) => {
        const full = origin + path + q;
        return `<li><span class="lbl">${label}</span>
          <a href="${full}" target="_blank" rel="noopener">${path}</a>
          <button class="copy" data-url="${full}">复制</button></li>`;
      })
      .join("")}</ul>`;

  return `<!doctype html><html lang="zh"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>订阅导航</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0f1115;color:#e6e6e6;
    margin:0;padding:24px;line-height:1.5}
  .wrap{max-width:860px;margin:0 auto}
  h1{font-size:18px}
  h2{font-size:14px;color:#9aa4b2;margin:28px 0 8px;border-bottom:1px solid #262a33;padding-bottom:6px}
  ul{list-style:none;padding:0;margin:0}
  li{display:flex;align-items:center;gap:10px;padding:6px 0;flex-wrap:wrap}
  .lbl{min-width:120px;color:#cbd5e1;font-size:13px}
  a{color:#60a5fa;text-decoration:none;font-size:13px;word-break:break-all;flex:1}
  a:hover{text-decoration:underline}
  button.copy{background:#2563eb;color:#fff;border:0;border-radius:6px;padding:4px 10px;
    font-size:12px;cursor:pointer}
  button.copy.ok{background:#16a34a}
  .tip{color:#9aa4b2;font-size:12px;margin-top:4px}
</style>
<div class="wrap">
  <h1>freesub 订阅导航</h1>
  <div class="tip">链接已自动带上密码参数 <code>${q}</code>，直接复制到客户端即可。</div>
  ${groups.map(section).join("")}
</div>
<script>
document.addEventListener('click', function(e){
  var b = e.target.closest('button.copy'); if(!b) return;
  navigator.clipboard.writeText(b.dataset.url).then(function(){
    var t = b.textContent; b.textContent='已复制'; b.classList.add('ok');
    setTimeout(function(){ b.textContent=t; b.classList.remove('ok'); }, 1200);
  });
});
</script>
</html>`;
}
