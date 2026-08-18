#!/usr/bin/env node
/**
 * coze-update.mjs —— 工作流 op 化编辑（句柄式，JSON 过大问题的解法）
 *
 * 用法（打包后零依赖）：
 *   node dist/coze-update.cjs <workflowId> <ops.json> [--space X]
 *
 * ops.json 支持：
 *   [{"op":"set","target":"节点title或id","field":"白名单字段","value":新值}]
 *   [{"op":"set_ref","target":"结束节点","outputName":"输出变量名","ref":"nodeId.outputName"}]
 *   [{"op":"rewrite_code","target":"代码节点","code":"完整python代码"}]
 *
 * 流程（句柄式）：自动拉平台最新 schema（stale 天然满足）→ 反转换项目格式
 * → 逐条执行 op → 转回平台格式 → 保存。全程无需传完整 JSON。
 *
 * set 白名单字段（对照项目 update_workflow）：
 *   config.model / userPrompt / systemPrompt / code / language / branches /
 *   outputs / outputVariables / inputVariables / data
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { platformToProject } from "../src/platform-to-project.ts";
import { applyOperations } from "../src/apply-operation.ts";
import { convertToPlatformSchema } from "../src/schema-converter.ts";

const CRED_PATH = path.join(homedir(), ".coze", "credentials.json");

function loadCred() {
  return JSON.parse(readFileSync(CRED_PATH, "utf8"));
}

async function call(cred, api, body, prefix = "/api/workflow_api/") {
  const res = await fetch(`${cred.origin}${prefix}${api}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_key=${cred.session_key}`,
      "Agw-Js-Conv": "str",
      "x-requested-with": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`CozeError[${json.code}]: ${json.msg}`);
  return json;
}

async function main() {
  const [wfId, opsFile, ...rest] = process.argv.slice(2);
  const spaceIdx = rest.indexOf("--space");
  const spaceId = spaceIdx >= 0 ? rest[spaceIdx + 1] : undefined;
  if (!wfId || !opsFile) {
    console.error("用法: node coze-update.cjs <workflowId> <ops.json> [--space X]");
    process.exit(1);
  }
  const cred = loadCred();
  const sid = spaceId ?? cred.space_id;

  // 1. 读平台最新 schema（句柄式：只传 workflowId）
  console.log(`1) 拉取工作流 ${wfId} 最新 schema...`);
  const canvas = await call(cred, "canvas", { workflow_id: wfId, space_id: sid });
  const schemaJson = canvas.data.workflow.schema_json;

  // 2. 平台格式 → 项目格式
  const converted = platformToProject(schemaJson);
  const workflow = converted.workflow;

  // 3. 执行 op
  const ops = JSON.parse(readFileSync(opsFile, "utf8"));
  if (!Array.isArray(ops)) {
    console.error("❌ ops.json 必须是数组");
    process.exit(1);
  }
  console.log(`2) 执行 ${ops.length} 条操作...`);
  const result = await applyOperations(workflow, ops, {
    codeGenerator: {
      generateCode: async () => {
        throw new Error("skill 无内置代码生成器，请用 rewrite_code 时传 code 字段");
      },
    },
  });
  if (result.changes.length === 0) {
    console.error(`❌ 无有效修改: ${result.errors.join("; ")}`);
    process.exit(1);
  }
  for (const c of result.changes) console.log(`   ✅ ${c}`);
  for (const e of result.errors) console.warn(`   ⚠️  ${e}`);

  // 4. 项目格式 → 平台格式
  const newSchemaJson = convertToPlatformSchema(result.workflow);

  // 5. 保存（自动拿锁 + 最新 commit）
  console.log("3) 保存...");
  await call(cred, "edit_lock", { workflow_id: wfId, space_id: sid, action: "acquire" });
  const cur = await call(cred, "canvas", { workflow_id: wfId, space_id: sid });
  await call(cred, "save", {
    workflow_id: wfId,
    schema: newSchemaJson,
    space_id: sid,
    submit_commit_id: cur.data.vcs_data.submit_commit_id,
    ignore_status_transfer: true,
  });
  console.log(`✅ 已保存: ${wfId}（${result.changes.length} 项修改生效）`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
