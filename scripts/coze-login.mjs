#!/usr/bin/env node
/**
 * coze-login.mjs —— Coze 扫码登录（零依赖，Node 18+）
 *
 * 流程：
 *  1. 生成企业微信扫码登录 URL（state 按 coze 前端格式构造）
 *  2. agent-browser --headed 弹出浏览器窗口 → 用户扫码
 *  3. 轮询浏览器 URL，检测跳转到 Coze 平台（登录成功标志）
 *  4. 提取 httpOnly session_key cookie
 *  5. 解析 JWT payload（user id / 过期时间），存凭证文件
 *
 * 凭证文件：~/.coze/credentials.json（按用户隔离，替代全局 .env COZE_SESSION_KEY）
 * 输出：登录成功 → 打印凭证摘要；失败 → 非零退出
 *
 * 配置：通过环境变量设置 Coze 平台连接信息
 *   COZE_ORIGIN         Coze 平台地址（如 https://coze.example.com）
 *   COZE_SSO_ORIGIN     SSO 地址（如 https://sso.example.com）
 *   COZE_CLIENT_ID      Casdoor OAuth client_id
 *   COZE_WECOM_APPID    企业微信应用 appid
 *   COZE_WECOM_AGENTID  企业微信应用 agentid
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// 从环境变量读取平台配置（部署时由管理员提供）
const COZE_ORIGIN = process.env.COZE_ORIGIN;
const SSO_ORIGIN = process.env.COZE_SSO_ORIGIN;
const CLIENT_ID = process.env.COZE_CLIENT_ID;
const WECOM_APPID = process.env.COZE_WECOM_APPID;
const WECOM_AGENTID = process.env.COZE_WECOM_AGENTID;

function validateConfig() {
  const missing = [];
  if (!COZE_ORIGIN) missing.push("COZE_ORIGIN");
  if (!SSO_ORIGIN) missing.push("COZE_SSO_ORIGIN");
  if (!CLIENT_ID) missing.push("COZE_CLIENT_ID");
  if (!WECOM_APPID) missing.push("COZE_WECOM_APPID");
  if (!WECOM_AGENTID) missing.push("COZE_WECOM_AGENTID");
  if (missing.length) {
    console.error(`❌ 缺少环境变量: ${missing.join(", ")}`);
    console.error("   请设置以上环境变量后再运行。参见 .env.example");
    process.exit(1);
  }
}

const SESSION = "coze-login"; // agent-browser session 名
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟等扫码
const POST_LOGIN_WAIT_MS = 12000; // 跳转后等 SPA 完成登录（JS 调 oauth_casdoor_code + 种 cookie）

const CRED_PATH = path.join(homedir(), ".coze", "credentials.json");

function ab(command, args = [], opts = {}) {
  // execFileSync 数组传参：不经 shell，URL 里的 & ? = 等字符不会被截断/转义
  return execFileSync(
    "agent-browser",
    ["--session", SESSION, "--headed", command, ...args],
    {
      encoding: "utf8",
      env: { ...process.env },
      ...opts,
    },
  );
}

function buildLoginUrl() {
  // coze 前端逻辑：state = base64url("?" + 原始 authorize 参数)
  const rand = (Math.random() * Date.now()).toFixed(0);
  const innerRedirect = encodeURIComponent(
    `${COZE_ORIGIN}/sign?redirect=${encodeURIComponent("/")}`
  );
  const query =
    `?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${innerRedirect}` +
    `&scope=read&state=${rand}&application=opencoze&provider=${encodeURIComponent("企业微信")}&method=signup`;
  const state = Buffer.from(query, "utf8").toString("base64url");
  const cb = encodeURIComponent(`${SSO_ORIGIN}/callback`);
  return (
    `https://login.work.weixin.qq.com/wwlogin/sso/login/?login_type=CorpApp` +
    `&appid=${WECOM_APPID}&agentid=${WECOM_AGENTID}&redirect_uri=${cb}&state=${state}`
  );
}

async function getPersonalSpaceId(key) {
  try {
    const res = await fetch(`${COZE_ORIGIN}/api/playground_api/space/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_key=${key}`,
        "Agw-Js-Conv": "str",
        "x-requested-with": "XMLHttpRequest",
      },
      body: "{}",
    });
    const json = await res.json();
    const list = json?.data?.bot_space_list ?? [];
    // 优先 Personal Space（space_type=1 或名字含 Personal），否则取第一个
    const personal = list.find((s) => s.space_type === 1 || /personal/i.test(s.name ?? ""));
    return (personal ?? list[0])?.id ?? "";
  } catch {
    return "";
  }
}

function decodeSessionPayload(key) {
  // session_key = base64url(payload) + 签名（无点分隔，payload 可能缺结尾 "}"）
  // 暴力法：从短到长试切分点，找能 JSON.parse 的最长前缀
  let best = null;
  for (let len = 30; len <= Math.min(key.length, 320); len++) {
    const b64 = key.slice(0, len);
    if (!/^[A-Za-z0-9_-]+$/.test(b64)) continue;
    try {
      const pad = b64 + "=".repeat((-b64.length) % 4);
      const obj = JSON.parse(Buffer.from(pad, "base64url").toString("utf8"));
      if (obj && typeof obj === "object" && (obj.id || obj.expires_at)) best = obj;
    } catch { /* 未到 payload 末尾，继续 */ }
  }
  return best;
}

function getSessionKeyFromCookies() {
  const raw = ab("cookies", ["--json"]);
  const data = JSON.parse(raw);
  const cookies = data?.data?.cookies ?? [];
  const host = new URL(COZE_ORIGIN).hostname;
  const hit = cookies.find((c) => c.name === "session_key" && c.domain.includes(host));
  return hit?.value ?? null;
}

async function main() {
  validateConfig();

  console.log("🔐 Coze 扫码登录");
  console.log("  - 将弹出浏览器窗口，请用企业微信 App 扫码");
  console.log("  - 凭证保存位置:", CRED_PATH);
  console.log();

  // 1. 打开登录页
  const url = buildLoginUrl();
  try {
    ab("open", [url]);
  } catch (e) {
    console.error("❌ 打开浏览器失败（agent-browser 是否安装？npm i -g agent-browser && agent-browser install）");
    console.error("  ", e.message.split("\n")[0]);
    process.exit(1);
  }
  console.log("✅ 浏览器窗口已弹出，等待扫码...");

  // 2. 轮询 URL 跳转 + session cookie
  const start = Date.now();
  let sawCoze = false;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let urlNow = "";
    try {
      urlNow = JSON.parse(ab("get", ["url", "--json"])).data?.url ?? "";
    } catch { /* 浏览器暂不可用，重试 */ }
    if (!sawCoze && urlNow.startsWith(COZE_ORIGIN)) {
      sawCoze = true;
      console.log("✅ 已跳转到 coze（登录处理中...）");
      await new Promise((r) => setTimeout(r, POST_LOGIN_WAIT_MS));
    }
    if (sawCoze) {
      const key = getSessionKeyFromCookies();
      if (key) {
        const payload = decodeSessionPayload(key);
        const spaceId = await getPersonalSpaceId(key);
        const cred = {
          session_key: key,
          user_id: payload?.id ?? "",
          space_id: spaceId,
          created_at: payload?.created_at ?? new Date().toISOString(),
          expires_at: payload?.expires_at ?? "",
          origin: COZE_ORIGIN,
        };
        mkdirSync(path.dirname(CRED_PATH), { recursive: true });
        writeFileSync(CRED_PATH, JSON.stringify(cred, null, 2) + "\n", { mode: 0o600 });
        console.log("\n🎉 登录成功！凭证已保存：");
        console.log(`   - user_id: ${cred.user_id}`);
        console.log(`   - space_id: ${cred.space_id || "（未获取到，可用 --space 指定）"}`);
        console.log(`   - 有效期至: ${cred.expires_at}（约 24h）`);
        try { ab("close", []); } catch { /* ignore */ }
        process.exit(0);
      }
    }
    // 未跳转时提示状态（每 30s）
    if (!sawCoze && (Date.now() - start) % 30000 < POLL_INTERVAL_MS) {
      console.log(`   ...等待扫码中（已等待 ${Math.round((Date.now() - start) / 1000)}s）`);
    }
  }
  console.error("❌ 超时未检测到登录（10 分钟）。请重试。");
  try { ab("close", []); } catch { /* ignore */ }
  process.exit(2);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(3);
});