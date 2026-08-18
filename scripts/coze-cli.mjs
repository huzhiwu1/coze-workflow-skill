#!/usr/bin/env node
/**
 * coze-cli.mjs —— Coze 工作流确定性能力 CLI（零依赖，Node 18+）
 *
 * 凭证：~/.coze/credentials.json（coze-login.mjs 生成）
 * 用法：
 *   node coze-cli.mjs status              # 登录态检查（含过期检测）
 *   node coze-cli.mjs list [--space X]    # 列工作流
 *   node coze-cli.mjs create <name> [desc] [--space X]
 *   node coze-cli.mjs read <wfId> [--space X]          # 读 schema（只读）
 *   node coze-cli.mjs rename <wfId> <name> [desc] [--space X]
 *   node coze-cli.mjs delete <wfId> [--space X]
 *   node coze-cli.mjs test-run <wfId> <jsonInput> [--space X]   # 试运行
 *   node coze-cli.mjs save <wfId> <schemaFile> [--space X]      # 保存 schema（自动拿锁+最新commit）
 *   node coze-cli.mjs facts [--space X]   # 平台事实（模型列表等）
 *   node coze-cli.mjs login               # 快捷：调 coze-login.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { spawn } from "node:child_process";

const CRED_PATH = path.join(homedir(), ".coze", "credentials.json");
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);

// ---------- 凭证 ----------
function loadCred() {
  if (!existsSync(CRED_PATH)) {
    console.error("❌ 未登录。请先运行: node coze-login.mjs（或 coze login）");
    process.exit(1);
  }
  return JSON.parse(readFileSync(CRED_PATH, "utf8"));
}

function isExpired(cred) {
  if (!cred.expires_at) return false;
  const exp = new Date(cred.expires_at).getTime();
  return Number.isFinite(exp) && exp < Date.now();
}

// ---------- HTTP ----------
async function call(cred, path, body, prefix = "/api/workflow_api/", method = "POST") {
  const url = `${cred.origin ?? "https://coze.dev1.dachensky.com"}${prefix}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_key=${cred.session_key}`,
      "Agw-Js-Conv": "str",
      "x-requested-with": "XMLHttpRequest",
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (json.code !== 0) {
    const err = new Error(`CozeError[${json.code}]: ${json.msg}`);
    err.code = json.code;
    throw err;
  }
  return json;
}

function spaceOf(cred, argv) {
  const i = argv.indexOf("--space");
  return i >= 0 ? argv[i + 1] : cred.space_id;
}

// ---------- 命令 ----------
async function cmdStatus(cred) {
  if (isExpired(cred)) {
    console.log(`⚠️  凭证已过期（${cred.expires_at}）。请重新扫码登录。`);
    process.exit(2);
  }
  console.log(`✅ 已登录（有效期至 ${cred.expires_at}）`);
  console.log(`   user_id : ${cred.user_id}`);
  console.log(`   space_id: ${cred.space_id ?? "（未设置，操作时用 --space 指定）"}`);
  // 探活：拉模型列表
  try {
    const r = await call(cred, "bot/get_model_list", { space_id: spaceOf(cred, []) }, "/api/");
    const n = (r.data?.model_list ?? []).length;
    console.log(`   探活   : ✅ API 正常（${n} 个模型）`);
  } catch (e) {
    if (e.code === 700012006) {
      console.log(`   探活   : ❌ session 失效（${e.message}），请重新登录`);
      process.exit(2);
    }
    console.log(`   探活   : ⚠️  ${e.message}`);
  }
}

async function cmdList(cred, args) {
  const sid = spaceOf(cred, args);
  const r = await call(cred, "plugin_api/library_resource_list", {
    user_filter: 0, res_type_filter: [2], name: "", publish_status_filter: 0,
    space_id: sid, size: 50, is_get_imageflow: true, owner_ids: [], desc: "", res_id: "",
  }, "/api/");
  const list = r?.resource_list ?? r?.data?.resource_list ?? [];
  console.log(`工作流（${list.length} 个, space=${sid}）:`);
  for (const w of list) {
    console.log(`  ${w.res_id}  ${w.name ?? ""}  ${w.description ?? ""}`.trimEnd());
  }
}

async function cmdCreate(cred, args) {
  const sid = spaceOf(cred, args);
  const name = args[0], desc = args[1] ?? "";
  if (!name) { console.error("用法: coze create <name> [desc]"); process.exit(1); }
  const r = await call(cred, "create", {
    name, desc, icon_uri: "default_icon/default_workflow_icon.png",
    space_id: sid, flow_mode: 0,
  });
  console.log(`✅ 已创建: ${r.data.workflow_id}  ${name}`);
}

async function cmdRead(cred, args) {
  const sid = spaceOf(cred, args);
  const id = args[0];
  if (!id) { console.error("用法: coze read <workflowId>"); process.exit(1); }
  const r = await call(cred, "canvas", { workflow_id: id, space_id: sid });
  console.log(JSON.stringify({ workflow_id: id, schema_json: r.data.workflow.schema_json, submit_commit_id: r.data.vcs_data.submit_commit_id }, null, 2));
}

async function cmdRename(cred, args) {
  const sid = spaceOf(cred, args);
  const [id, name, desc = ""] = args;
  if (!id || !name) { console.error("用法: coze rename <workflowId> <name> [desc]"); process.exit(1); }
  await call(cred, "update_meta", { workflow_id: id, space_id: sid, name, desc, icon_uri: "" });
  console.log(`✅ 已重命名: ${id} → ${name}`);
}

async function cmdDelete(cred, args) {
  const sid = spaceOf(cred, args);
  const id = args[0];
  if (!id) { console.error("用法: coze delete <workflowId>"); process.exit(1); }
  await call(cred, "delete", { workflow_id: id, space_id: sid, action: 1 });
  console.log(`✅ 已删除工作流: ${id}`);
}

async function cmdDbDelete(cred, args) {
  const [id] = args;
  if (!id) { console.error("用法: coze db-delete <databaseId>"); process.exit(1); }
  // POST /api/memory/database/delete（2026-08-18 用户提供，body 只要 id）
  await dbCall(cred, "memory/database/delete", { id });
  console.log(`✅ 已删除数据库: ${id}`);
}

async function cmdTestRun(cred, args) {
  const sid = spaceOf(cred, args);
  const [id, inputJson] = args;
  if (!id) { console.error("用法: coze test-run <workflowId> '<json>'"); process.exit(1); }
  let input = {};
  if (inputJson) {
    try { input = JSON.parse(inputJson); } catch { console.error("❌ input 不是合法 JSON"); process.exit(1); }
  }
  const r = await call(cred, "test_run", { workflow_id: id, input, space_id: sid });
  console.log(`✅ 已提交试运行: execute_id=${r.data.execute_id}`);
}

async function getProcess(cred, wfId, execId) {
  const qs = new URLSearchParams({
    workflow_id: wfId,
    space_id: cred.space_id,
    execute_id: execId,
    need_async: "true",
  });
  const url = `${cred.origin ?? "https://coze.dev1.dachensky.com"}/api/workflow_api/get_process?${qs}`;
  const res = await fetch(url, {
    headers: {
      Cookie: `session_key=${cred.session_key}`,
      "Agw-Js-Conv": "str",
      "x-requested-with": "XMLHttpRequest",
    },
  });
  return res.json();
}

async function cmdRun(cred, args) {
  const sid = spaceOf(cred, args);
  const [id, inputJson] = args;
  if (!id) { console.error("用法: coze run <workflowId> '<json>'"); process.exit(1); }
  let input = {};
  if (inputJson) {
    try { input = JSON.parse(inputJson); } catch { console.error("❌ input 不是合法 JSON"); process.exit(1); }
  }
  const r = await call(cred, "test_run", { workflow_id: id, input, space_id: sid });
  const execId = r.data.execute_id;
  console.log(`⏳ 已提交: execute_id=${execId}，轮询结果...`);
  const maxWait = 180 * 1000;
  const start = Date.now();
  let last = "";
  while (Date.now() - start < maxWait) {
    await new Promise((res) => setTimeout(res, 4000));
    let d;
    try {
      const j = await getProcess(cred, id, execId);
      d = j.data ?? {};
    } catch (e) {
      console.error("⚠️  查询失败:", e.message);
      continue;
    }
    const st = d.executeStatus;
    // executeStatus: 0/1=排队/运行中, 2=成功, 3=失败（2026-08-17 实测 2=成功）
    if (st !== undefined && st !== 0 && st !== 1) {
      const nodes = d.nodeResults ?? [];
      console.log(`\n✅ 执行结束: executeStatus=${st}（${st === 2 ? "成功" : "失败"}）耗时 ${d.workflowExeCost ?? "?"}`);
      for (const n of nodes) {
        const status = n.nodeStatus === 3 ? "✅" : "❌";
        console.log(`  ${status} [${n.NodeName}] ${n.nodeId} error=${n.errorInfo || "无"}`);
        if (n.output && n.NodeType === "End") {
          console.log(`   └─ 输出: ${String(n.output).slice(0, 500)}`);
        }
      }
      if (st !== 2) {
        const err = nodes.find((n) => n.errorInfo)?.errorInfo ?? d.reason ?? "未知错误";
        console.error(`\n❌ 执行失败: ${err}`);
        process.exit(1);
      }
      return;
    }
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (last !== String(st)) { console.log(`   ...执行中（${elapsed}s, executeStatus=${st}）`); last = String(st); }
  }
  console.error("❌ 轮询超时（180s）。可稍后手动查询 execute_id:", execId);
  process.exit(1);
}

async function cmdSave(cred, args) {
  const sid = spaceOf(cred, args);
  const [id, schemaFile] = args;
  if (!id || !schemaFile) { console.error("用法: coze save <workflowId> <schema.json>"); process.exit(1); }
  const schemaJson = readFileSync(schemaFile, "utf8");
  // 拿编辑锁
  await call(cred, "edit_lock", { workflow_id: id, space_id: sid, action: "acquire" });
  // 拿最新 commit
  const cur = await call(cred, "canvas", { workflow_id: id, space_id: sid });
  const submitCommitId = cur.data.vcs_data.submit_commit_id;
  // 校验（可选，失败仅提示）
  try {
    const v = await call(cred, "validate_tree", { workflow_id: id, schema: schemaJson });
    const errs = v.data ?? [];
    if (errs.length) {
      console.warn(`⚠️  validate_tree 发现 ${errs.length} 个问题:`);
      for (const e of errs.slice(0, 5)) console.warn(`   - ${JSON.stringify(e).slice(0, 200)}`);
    }
  } catch { /* 校验失败不阻断 */ }
  await call(cred, "save", { workflow_id: id, schema: schemaJson, space_id: sid, submit_commit_id: submitCommitId, ignore_status_transfer: true });
  console.log(`✅ 已保存: ${id}（commit ${submitCommitId}）`);
}

async function cmdFacts(cred, args) {
  const sid = spaceOf(cred, args);
  const r = await call(cred, "bot/get_model_list", { space_id: sid }, "/api/");
  const models = r.data?.model_list ?? [];
  console.log(`平台模型（${models.length} 个）:`);
  for (const m of models.slice(0, 30)) {
    console.log(`  ${m.model_id ?? m.id ?? ""}  ${m.model_name ?? m.name ?? ""}`);
  }
}
// ============ 数据库（知识库）能力 ============
// 平台 API（2026-08-17 实测）：
//   POST /api/memory/database/add         创建库（table_name 小写字母开头，仅小写字母数字下划线）
//   POST /api/bot/upload_file             上传文件（xlsx base64）→ upload_url（提取 BIZ_BOT_DATASET/... 为 tos_uri）
//   POST /api/memory/table_schema/get     获取表结构/预览（table_data_type 1=结构 2=数据）
//   POST /api/memory/table_schema/validate 校验 schema
//   POST /api/memory/table_file/submit    导入数据
//   POST /api/memory/table_file/get_progress 导入进度
//   POST /api/playground_api/space/list   空间列表（创建前提醒用户选空间）

async function getUserId(cred) {
  const r = await call(cred, "passport/account/info/v2/", {}, "/api/");
  return r.data?.user_id_str ?? "";
}

async function dbCall(cred, api, body) {
  return call(cred, api, body, "/api/");
}

function extractTosUri(uploadUrl) {
  const m = /(BIZ_BOT_DATASET\/[^?&]+)/.exec(uploadUrl ?? "");
  return m ? m[1] : uploadUrl ?? "";
}

const DB_SHEET = { sheet_id: "0", header_line_idx: "0", start_line_idx: "1" };

async function cmdDbCreate(cred, args) {
  const sid = spaceOf(cred, args);
  const [name, desc = ""] = args;
  if (!name) { console.error("用法: coze db-create <name> <desc> [--fields 'json'] [--space X]"); process.exit(1); }
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    console.error("❌ 表名只允许小写字母开头的小写字母/数字/下划线");
    process.exit(1);
  }
  const fieldsFlag = args.indexOf("--fields");
  let fields = [{ name: "url", desc: "链接", type: 1, must_required: true }];
  if (fieldsFlag >= 0 && args[fieldsFlag + 1]) {
    try { fields = JSON.parse(args[fieldsFlag + 1]); } catch { console.error("❌ --fields 不是合法 JSON"); process.exit(1); }
  }
  const uid = await getUserId(cred);
  const r = await dbCall(cred, "memory/database/add", {
    creator_id: uid,
    space_id: sid,
    icon_uri: "default_icon/default_database_icon.png",
    table_name: name,
    table_desc: desc,
    field_list: fields,
    prompt_disabled: false,
  });
  const info = r?.database_info ?? r?.data?.database_info ?? {};
  console.log(`✅ 数据库已创建: ${info.id}  ${name}（表 ${info.actual_table_name ?? ""}）space=${sid}`);
}

async function cmdDbUpload(cred, args) {
  const [file] = args;
  if (!file) { console.error("用法: coze db-upload <file.xlsx>"); process.exit(1); }
  const { readFileSync } = await import("node:fs");
  const b64 = readFileSync(file).toString("base64");
  const ext = file.split(".").pop()?.toLowerCase() ?? "xlsx";
  const r = await dbCall(cred, "bot/upload_file", {
    file_head: { file_type: ext, biz_type: 2 },
    data: b64,
  });
  const tos = extractTosUri(r.data?.upload_url ?? r.data?.tos_uri ?? "");
  console.log(`✅ 上传成功 tos_uri=${tos}`);
}

async function cmdDbSchema(cred, args) {
  const [dbId, tosUri] = args;
  if (!dbId || !tosUri) { console.error("用法: coze db-schema <databaseId> <tos_uri>"); process.exit(1); }
  const r = await dbCall(cred, "memory/table_schema/get", {
    table_sheet: DB_SHEET,
    table_data_type: 1,
    database_id: dbId,
    source_file: { tos_uri: tosUri },
  });
  console.log(JSON.stringify(r.data ?? {}, null, 2));
}

async function cmdDbImport(cred, args) {
  const [dbId, tosUri] = args;
  const wait = args.includes("--wait");
  if (!dbId || !tosUri) { console.error("用法: coze db-import <databaseId> <tos_uri> [--wait]"); process.exit(1); }
  const val = await dbCall(cred, "memory/table_schema/validate", {
    database_id: dbId,
    source_file: { tos_uri: tosUri },
    table_sheet: DB_SHEET,
    table_type: 1,
  });
  console.log(`✅ schema 校验: ${JSON.stringify(val.data ?? {})}`);
  const imp = await dbCall(cred, "memory/table_file/submit", {
    database_id: dbId,
    file_uri: tosUri,
    table_type: 1,
    table_sheet: DB_SHEET,
  });
  console.log(`✅ 导入已提交: ${JSON.stringify(imp.data ?? {})}`);
  if (wait) {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const prog = await dbCall(cred, "memory/table_file/get_progress", { database_id: dbId, table_type: 1 });
      const p = prog.data?.progress ?? -1;
      console.log(`   进度: ${p}% ${prog.data?.status_descript ?? ""}`);
      if (p >= 100) { console.log("✅ 导入完成"); return; }
    }
    console.log("⚠️ 轮询超时（90s），可稍后查进度");
  }
}

async function cmdDbList(cred, args) {
  const sid = spaceOf(cred, args);
  const r = await dbCall(cred, "memory/database/list", { space_id: sid, table_type: 2 });
  const list = r?.database_info_list ?? r?.data?.database_info_list ?? [];
  console.log(`数据库（${list.length} 个, space=${sid}）:`);
  for (const db of list) {
    console.log(`  ${db.id}  ${db.table_name}  ${db.table_desc ?? ""}`.trimEnd());
  }
}

async function cmdUpdate(cred, args) {
  // op 化编辑：委托 dist/coze-update.cjs（read→反转换→op→转换→save 全自动）
  const { spawn } = await import("node:child_process");
  const script = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "dist", "coze-update.cjs");
  const p = spawn("node", [script, ...args], { stdio: "inherit" });
  p.on("exit", (c) => process.exit(c ?? 0));
}

async function cmdPublish(cred, args) {
  const sid = spaceOf(cred, args);
  const [id, ...rest] = args;
  if (!id) { console.error("用法: coze publish <workflowId> [--version v0.0.1] [--desc 描述]"); process.exit(1); }
  const vIdx = rest.indexOf("--version");
  const dIdx = rest.indexOf("--desc");
  const version = vIdx >= 0 ? rest[vIdx + 1] : "v0.0.1";
  const desc = dIdx >= 0 ? rest[dIdx + 1] : "发布";
  // POST /api/workflow_api/publish（2026-08-18 用户提供）
  const r = await call(cred, "publish", {
    workflow_id: id,
    space_id: sid,
    has_collaborator: false,
    force: true,
    workflow_version: version,
    version_description: desc,
  });
  console.log(`✅ 已发布: ${id} ${version}（${desc}）`);
}

async function cmdSpaces(cred) {
  // POST /api/playground_api/space/list（2026-08-17 实测）
  const r = await dbCall(cred, "playground_api/space/list", {});
  const list = r.data?.bot_space_list ?? [];
  console.log(`可用空间（${list.length} 个）:`);
  for (const sp of list) {
    const cur = sp.id === cred.space_id ? "  ◀ 当前默认" : "";
    console.log(`  ${sp.id}  ${sp.name}  [${sp.role_name ?? ""}]${cur}`);
    if (sp.description) console.log(`      └─ ${sp.description}`);
  }
  console.log("\n创建时用 --space <id> 指定空间（默认 Personal Space）");
}

// ---------- 入口 ----------
const [cmd, ...args] = process.argv.slice(2);
if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(`用法:
  coze login                        # 扫码登录（调 coze-login.mjs）
  coze status                       # 登录态检查
  coze list [--space X]             # 列工作流
  coze create <name> [desc] [--space X]
  coze read <workflowId> [--space X]
  coze rename <workflowId> <name> [desc] [--space X]
  coze delete <workflowId> [--space X]
  coze test-run <workflowId> '<json>' [--space X]
  coze run <workflowId> '<json>' [--space X]      # 试运行 + 轮询结果（推荐）
  coze save <workflowId> <schema.json> [--space X]
  coze facts [--space X]            # 平台模型列表
  coze db-create <name> <desc> [--fields 'json'] [--space X]  # 创建数据库（表名小写字母开头）
  coze db-upload <file.xlsx>        # 上传文件 → tos_uri
  coze db-schema <dbId> <tos_uri> [--space X]  # 获取表结构
  coze db-import <dbId> <tos_uri> [--wait] [--space X]  # 校验+导入（--wait 轮询进度）
  coze db-list [--space X]          # 数据库列表
  coze db-delete <databaseId>      # 删除数据库
  coze spaces                       # 可用空间列表（创建前先确认放哪个空间）
  coze update <wfId> <ops.json> [--space X]  # op 化编辑（set/set_ref/rewrite_code，句柄式）
  coze publish <wfId> [--version v0.0.1] [--desc 描述] [--space X]  # 发布工作流（子工作流调用需要版本号）`);
  process.exit(0);
}
if (cmd === "login") {
  const p = spawn("node", [path.join(SCRIPT_DIR, "coze-login.mjs")], { stdio: "inherit" });
  p.on("exit", (c) => process.exit(c ?? 0));
} else {
  main();
}

async function main() {
  let cred;
  try { cred = loadCred(); } catch (e) { console.error("❌ 凭证损坏:", e.message); process.exit(1); }
  if (isExpired(cred)) {
    console.error(`⚠️  凭证已过期（${cred.expires_at}）。请重新登录: node coze-login.mjs`);
    process.exit(2);
  }

  const handlers = { status: cmdStatus, list: cmdList, create: cmdCreate, read: cmdRead, rename: cmdRename, delete: cmdDelete, "test-run": cmdTestRun, run: cmdRun, save: cmdSave, facts: cmdFacts, "db-create": cmdDbCreate, "db-upload": cmdDbUpload, "db-schema": cmdDbSchema, "db-import": cmdDbImport, "db-list": cmdDbList, spaces: cmdSpaces, update: cmdUpdate, "db-delete": cmdDbDelete, publish: cmdPublish };
  const fn = handlers[cmd];
  if (!fn) { console.error(`❌ 未知命令: ${cmd}`); process.exit(1); }
  fn(cred, args).catch((e) => {
    if (e.code === 700012006) console.error(`❌ session 失效，请重新登录（${e.message}）`);
    else console.error("❌", e.message);
    process.exit(1);
  });
}
