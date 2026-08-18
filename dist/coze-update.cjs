#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/coze-update.mjs
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = __toESM(require("node:path"), 1);

// src/platform-to-project.ts
var PLATFORM_TYPE_MAP = {
  "1": "start",
  "2": "end",
  "3": "llm",
  "5": "code",
  "8": "condition",
  "15": "text",
  "32": "merge",
  "43": "database_query",
  "45": "http"
};
var LLM_BUILTIN_OUTPUTS = /* @__PURE__ */ new Set([
  "reasoning_content",
  "errorBody",
  "isSuccess"
]);
var LLM_PARAM_MAPPABLE = /* @__PURE__ */ new Set([
  "temperature",
  "maxTokens",
  "modleName",
  "prompt",
  "systemPrompt"
]);
function platformToProject(schemaJson, opts) {
  const warnings = [];
  const parsed = JSON.parse(schemaJson);
  const rawSchema = parsed.json && typeof parsed.json === "object" ? parsed.json : parsed;
  const platformNodes = rawSchema.nodes ?? [];
  const platformEdges = rawSchema.edges ?? [];
  const edges = platformEdges.map((e, i) => ({
    id: `e${i}`,
    sourceNodeId: String(e.sourceNodeID ?? ""),
    targetNodeId: String(e.targetNodeID ?? ""),
    ...e.sourcePortID ? { sourcePort: e.sourcePortID } : {}
  }));
  const portTargets = /* @__PURE__ */ new Map();
  for (const e of platformEdges) {
    if (e.sourceNodeID && e.sourcePortID && e.targetNodeID) {
      portTargets.set(`${e.sourceNodeID}|${e.sourcePortID}`, e.targetNodeID);
    }
  }
  const nodes = [];
  for (const raw of platformNodes) {
    nodes.push(convertNode(raw, nodes.length, warnings, portTargets));
  }
  const { nodes: finalNodes, edges: finalEdges } = ensureStartEnd(
    nodes,
    edges
  );
  const workflow = {
    meta: {
      name: opts?.workflowName ?? "platform_imported_workflow",
      description: "\u7531\u5E73\u53F0 schema \u53CD\u8F6C\u6362\u751F\u6210",
      version: "1.0.0"
    },
    nodes: finalNodes,
    edges: finalEdges
  };
  return { workflow, warnings, rawSchema };
}
function convertNode(raw, index, warnings, portTargets) {
  const id = String(raw.id ?? `node_${index}`);
  const nodeMeta = raw.data?.nodeMeta ?? {};
  const title = String(nodeMeta.title ?? id);
  const desc = nodeMeta.description ? String(nodeMeta.description) : void 0;
  const typeNumber = String(raw.type ?? "");
  const typeName = PLATFORM_TYPE_MAP[typeNumber];
  const base = {
    id,
    title,
    ...desc ? { desc } : {},
    ...raw.meta?.position ? {
      position: {
        x: raw.meta.position.x ?? 0,
        y: raw.meta.position.y ?? 0
      }
    } : {}
  };
  if (!typeName) {
    warnings.push(
      `\u8282\u70B9\u300C${title}\u300D\u7C7B\u578B ${typeNumber} \u672A\u77E5\uFF0C\u5DF2\u4FDD\u7559\u6570\u5B57\u7C7B\u578B\uFF0C\u539F\u59CB\u6570\u636E\u5B58\u5165\u900F\u4F20\u533A`
    );
    const platformRaw2 = {};
    if (raw.data) platformRaw2.data = raw.data;
    return {
      ...base,
      type: typeNumber,
      _temp: { externalData: { platformRaw: platformRaw2 } }
    };
  }
  const inputs = raw.data?.inputs ?? {};
  const outputs = raw.data?.outputs ?? [];
  const platformRaw = {};
  let converted = {};
  switch (typeName) {
    case "llm": {
      const llmParam = inputs.llmParam ?? [];
      const literalOf = (name) => llmParam.find((p) => p.name === name)?.input?.value?.content;
      const model = String(literalOf("modleName") ?? "Doubao-Seed-2.0-Lite");
      const temperature = Number(literalOf("temperature"));
      const maxTokens = Number(literalOf("maxTokens"));
      converted.config = {
        model,
        ...Number.isFinite(temperature) ? { temperature } : {},
        ...Number.isFinite(maxTokens) ? { maxTokens } : {}
      };
      converted.userPrompt = String(literalOf("prompt") ?? "");
      const systemPrompt = String(literalOf("systemPrompt") ?? "");
      if (systemPrompt) converted.systemPrompt = systemPrompt;
      const inputMapping = paramsToMapping(
        inputs.inputParameters ?? []
      );
      if (Object.keys(inputMapping).length > 0) {
        converted.inputMapping = inputMapping;
      }
      converted.outputs = outputs.filter((o) => !LLM_BUILTIN_OUTPUTS.has(String(o.name))).map((o) => outputToProject(o));
      const unmappedParams = llmParam.filter(
        (p) => !LLM_PARAM_MAPPABLE.has(String(p.name))
      );
      if (unmappedParams.length > 0) platformRaw.llmParam = unmappedParams;
      if (inputs.settingOnError !== void 0) {
        platformRaw.settingOnError = inputs.settingOnError;
      }
      break;
    }
    case "code": {
      converted.code = String(inputs.code ?? "");
      converted.language = inputs.language === 1 ? "javascript" : "python";
      const inputMapping = paramsToMapping(
        inputs.inputParameters ?? []
      );
      if (Object.keys(inputMapping).length > 0) {
        converted.inputMapping = inputMapping;
      }
      converted.outputs = outputs.map((o) => outputToProject(o));
      if (inputs.settingOnError !== void 0) {
        platformRaw.settingOnError = inputs.settingOnError;
      }
      break;
    }
    case "condition": {
      const branches = inputs.branches ?? [];
      const convertedBranches = branches.map((b, i) => {
        const rendered = renderBranchCondition(b, title, warnings, i);
        const port = i === 0 ? "true" : `true_${i + 1}`;
        const targetNodeId = portTargets.get(`${id}|${port}`) ?? portTargets.get(`${id}|true`) ?? "";
        return {
          label: b.label ?? `\u5206\u652F${i + 1}`,
          condition: rendered,
          expression: rendered,
          targetNodeId
        };
      });
      const defaultTarget = portTargets.get(`${id}|false`) ?? portTargets.get(`${id}|default`) ?? "";
      converted.branches = convertedBranches;
      converted.defaultBranch = defaultTarget;
      platformRaw.branches = branches;
      break;
    }
    case "text": {
      converted.method = "concat";
      const concatParams = inputs.concatParams ?? [];
      const concatResult = concatParams.find((p) => p.name === "concatResult")?.input?.value?.content;
      converted.concatParams = [
        { name: "concatResult", value: String(concatResult ?? "") }
      ];
      const inputMapping = paramsToMapping(
        inputs.inputParameters ?? []
      );
      if (Object.keys(inputMapping).length > 0) {
        converted.inputMapping = inputMapping;
      }
      if (outputs.length > 0) {
        converted.outputs = outputs.map((o) => outputToProject(o));
      }
      break;
    }
    case "merge": {
      const groups = inputs.mergeGroups ?? [];
      converted.mergeGroups = groups.map((g) => ({
        name: String(g.name ?? "Group1"),
        variables: (g.variables ?? []).map(
          (v) => valueToRefExpr(v.value, "output")
        )
      }));
      break;
    }
    case "database_query": {
      const dbList = inputs.databaseInfoList ?? [];
      converted.connection = String(dbList[0]?.databaseInfoID ?? "");
      converted.query = inputs.selectParam ? JSON.stringify(inputs.selectParam) : "";
      if (inputs.selectParam !== void 0) {
        platformRaw.selectParam = inputs.selectParam;
      }
      if (inputs.settingOnError !== void 0) {
        platformRaw.settingOnError = inputs.settingOnError;
      }
      if (outputs.length > 0) {
        converted.outputs = outputs.map((o) => outputToProject(o));
      }
      break;
    }
    case "http": {
      const apiInfo = inputs.apiInfo ?? {};
      converted.method = String(apiInfo.method ?? "GET");
      converted.url = String(apiInfo.url ?? "");
      const inputMapping = paramsToMapping(
        inputs.inputParameters ?? []
      );
      if (Object.keys(inputMapping).length > 0) {
        converted.inputMapping = inputMapping;
      }
      if (outputs.length > 0) {
        converted.outputs = outputs.map((o) => outputToProject(o));
      }
      for (const key of ["body", "headers", "params", "auth", "setting"]) {
        if (inputs[key] !== void 0) platformRaw[key] = inputs[key];
      }
      break;
    }
    case "start": {
      converted.inputVariables = outputs.map((o) => ({
        name: String(o.name ?? "input"),
        type: String(o.type ?? "string"),
        required: o.required ?? true,
        ...o.defaultValue !== void 0 ? { default: o.defaultValue } : {}
      }));
      break;
    }
    case "end": {
      const inputParameters = inputs.inputParameters ?? [];
      converted.outputVariables = inputParameters.map((p) => ({
        name: String(p.name ?? "output"),
        type: String(p.input?.type ?? "string"),
        value: valueToRefExpr(p.input?.value, "output")
      }));
      break;
    }
  }
  const node = {
    ...base,
    type: typeName,
    ...converted
  };
  if (Object.keys(platformRaw).length > 0) {
    node._temp = { externalData: { platformRaw } };
  }
  return node;
}
function paramsToMapping(params) {
  const mapping = {};
  for (const p of params) {
    const name = String(p.name ?? "");
    if (!name) continue;
    mapping[name] = valueToRefExpr(p.input?.value, "output");
  }
  return mapping;
}
function valueToRefExpr(value, fallbackOutputName) {
  const v = value;
  if (v && v.type === "ref" && v.content && v.content.blockID) {
    return `${v.content.blockID}.${v.content.name ?? fallbackOutputName}`;
  }
  if (v && v.type === "literal") {
    return String(v.content ?? "");
  }
  return "";
}
function outputToProject(o) {
  return {
    type: o.type ?? "string",
    name: o.name ?? "output",
    ...o.schema !== void 0 ? { schema: o.schema } : {},
    ...o.required !== void 0 ? { required: o.required } : {}
  };
}
function renderBranchCondition(branch, title, warnings, index) {
  const first = (branch.condition?.conditions ?? [])[0];
  const operator = first?.operator;
  const value = first?.left?.input?.value;
  if (value?.type === "ref" && value.content?.blockID) {
    const ref = `${value.content.blockID}.${value.content.name ?? "output"}`;
    return operator === 11 ? `${ref} == true` : `${ref}\uFF08operator=${String(operator)}\uFF09`;
  }
  if (value?.type === "literal") {
    const content = String(value.content ?? "");
    return operator === 11 ? `${content} == true` : content;
  }
  warnings.push(
    `\u8282\u70B9\u300C${title}\u300D\u5206\u652F ${index + 1} \u7684\u6761\u4EF6\u7ED3\u6784\u65E0\u6CD5\u8FD8\u539F\uFF08operator=${String(operator)}\uFF09\uFF0C\u5DF2\u4FDD\u7559\u539F\u59CB\u7ED3\u6784\u5230\u900F\u4F20\u533A`
  );
  return `\u6761\u4EF6\uFF08operator=${String(operator)}\uFF09`;
}
var START_NODE_ID = "100001";
var END_NODE_ID = "900001";
function ensureStartEnd(nodes, edges) {
  const hasStart = nodes.some((n) => n.type === "start");
  const hasEnd = nodes.some((n) => n.type === "end");
  if (hasStart && hasEnd) return { nodes, edges };
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = /* @__PURE__ */ new Map();
  const outDegree = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
  }
  for (const e of edges) {
    if (!nodeIds.has(e.sourceNodeId) || !nodeIds.has(e.targetNodeId)) continue;
    if (e.sourceNodeId === e.targetNodeId) continue;
    outDegree.set(e.sourceNodeId, (outDegree.get(e.sourceNodeId) ?? 0) + 1);
    inDegree.set(e.targetNodeId, (inDegree.get(e.targetNodeId) ?? 0) + 1);
  }
  const resultNodes = [...nodes];
  const resultEdges = [...edges];
  let edgeSeq = edges.length;
  if (!hasStart) {
    resultNodes.push({
      id: START_NODE_ID,
      type: "start",
      title: "\u5F00\u59CB",
      inputVariables: []
    });
    for (const n of nodes) {
      if ((inDegree.get(n.id) ?? 0) === 0) {
        resultEdges.push({
          id: `e${edgeSeq++}`,
          sourceNodeId: START_NODE_ID,
          targetNodeId: n.id
        });
      }
    }
  }
  if (!hasEnd) {
    resultNodes.push({
      id: END_NODE_ID,
      type: "end",
      title: "\u7ED3\u675F",
      outputVariables: []
    });
    for (const n of nodes) {
      if ((outDegree.get(n.id) ?? 0) === 0) {
        resultEdges.push({
          id: `e${edgeSeq++}`,
          sourceNodeId: n.id,
          targetNodeId: END_NODE_ID
        });
      }
    }
  }
  return { nodes: resultNodes, edges: resultEdges };
}

// src/apply-operation.ts
function findTargetNode(nodes, target) {
  return nodes.find((n) => n.title === target) ?? nodes.find((n) => n.id === target) ?? nodes.find((n) => n.title.includes(target));
}
function applySet(node, op, targetName) {
  const { field, value } = op;
  if (field === "config.model") {
    const config = node.config ?? {};
    config.model = value;
    node.config = config;
    return [`\u8282\u70B9 ${targetName} \u6A21\u578B\u5DF2\u66F4\u65B0\u4E3A ${String(value)}`];
  }
  if (field === "branches") {
    const oldBranches = node.branches ?? [];
    const newBranches = value;
    const next = [];
    const invalid = [];
    for (let i = 0; i < newBranches.length; i++) {
      const b = newBranches[i];
      if (typeof b?.expression !== "string" || b.expression.trim() === "") {
        invalid.push(String(i + 1));
        continue;
      }
      next.push({
        expression: b.expression,
        // 省略 targetNodeId 时保留旧 branches 同位置的值（只改表达式）
        targetNodeId: typeof b.targetNodeId === "string" && b.targetNodeId ? b.targetNodeId : oldBranches[i]?.targetNodeId ?? ""
      });
    }
    if (invalid.length > 0) {
      return `\u8282\u70B9 ${targetName} branches \u7B2C ${invalid.join("\u3001")} \u4E2A\u5143\u7D20\u7F3A\u5C11 expression \u5B57\u6BB5\uFF08\u5F62\u72B6\u5E94\u4E3A {expression, targetNodeId}\uFF09`;
    }
    node.branches = next;
    return [`\u8282\u70B9 ${targetName} \u6761\u4EF6\u5206\u652F\u5DF2\u66F4\u65B0\uFF08expression \u5F62\u72B6\uFF09`];
  }
  if (!field) return `set \u64CD\u4F5C\u7F3A\u5C11 field \u5B57\u6BB5`;
  node[field] = value;
  return [`\u8282\u70B9 ${targetName} ${field} \u5DF2\u66F4\u65B0`];
}
function applySetRef(node, op, targetName) {
  if (node.type !== "end") {
    return `set_ref \u4EC5\u652F\u6301\u7ED3\u675F\u8282\u70B9\uFF0C\u8282\u70B9 ${targetName} \u7C7B\u578B\u662F ${node.type}\uFF08converter \u53EA\u6D88\u8D39 end \u8282\u70B9\u7684 outputVariables\uFF09`;
  }
  const outputVars = node.outputVariables;
  if (!Array.isArray(outputVars) || outputVars.length === 0) {
    return `\u8282\u70B9 ${targetName} \u6CA1\u6709 outputVariables \u58F0\u660E\uFF0C\u65E0\u6CD5\u6539\u5F15\u7528`;
  }
  const target = outputVars.find((v) => v.name === op.outputName);
  if (!target) {
    return `\u8282\u70B9 ${targetName} \u672A\u627E\u5230\u8F93\u51FA\u53D8\u91CF ${op.outputName}\uFF08\u73B0\u6709\uFF1A${outputVars.map((v) => v.name ?? "?").join("\u3001")}\uFF09`;
  }
  target.value = op.ref;
  return [`\u8282\u70B9 ${targetName} \u8F93\u51FA\u53D8\u91CF ${op.outputName} \u5F15\u7528\u5DF2\u66F4\u65B0\u4E3A ${op.ref}`];
}
async function applyRewriteCode(node, op, targetName, ctx) {
  if (node.type !== "code") {
    return `\u8282\u70B9 ${targetName} \u4E0D\u662F\u4EE3\u7801\u8282\u70B9\uFF08type=${String(node.type)}\uFF09`;
  }
  if (op.code) {
    node.code = op.code;
    node.language = "python";
    return [`\u8282\u70B9 ${targetName} \u4EE3\u7801\u5DF2\u66F4\u65B0\uFF08op.code \u76F4\u4F20\uFF09`];
  }
  const nodeRef = node.referenceData;
  const merged = {
    ...nodeRef && Object.keys(nodeRef).length > 0 ? nodeRef : {},
    ...op.referenceData ?? {},
    ...ctx.userReferenceData ?? {}
  };
  if (Object.keys(merged).length === 0) {
    return `\u8282\u70B9 ${targetName} \u65E0\u53C2\u8003\u6570\u636E\uFF0C\u8BF7\u5148\u63D0\u4F9B\u6B4C\u8BCD\u5E93/\u6570\u636E\u540E\u518D\u91CD\u5199\uFF08\u9632\u6B62 LLM \u5E7B\u89C9\u7F16\u9020\u6570\u636E\uFF09`;
  }
  const code = await ctx.codeGenerator.generateCode(
    op.logicDescription ?? "",
    void 0,
    merged
  );
  node.code = code;
  node.language = "python";
  return [`\u8282\u70B9 ${targetName} \u4EE3\u7801\u903B\u8F91\u5DF2\u6309\u65B0\u63CF\u8FF0\u91CD\u5199\uFF08\u6CE8\u5165\u53C2\u8003\u6570\u636E ${Object.keys(merged).length} \u9879\uFF09`];
}
async function applyOperations(workflow, operations, ctx) {
  const next = structuredClone(workflow);
  const changes = [];
  const errors = [];
  for (const op of operations) {
    if (op.op === "delete_node" || op.op === "delete_edge") {
      errors.push(`\u64CD\u4F5C ${op.op} \u5C5E\u4E8C\u671F\uFF0C\u672C\u671F\u672A\u542F\u7528`);
      continue;
    }
    const node = findTargetNode(next.nodes, op.target ?? "");
    if (!node) {
      errors.push(`\u672A\u627E\u5230\u8282\u70B9: ${op.target}`);
      continue;
    }
    const targetName = node.title;
    const loose = node;
    try {
      const outcome = op.op === "set" ? applySet(loose, op, targetName) : op.op === "set_ref" ? applySetRef(loose, op, targetName) : await applyRewriteCode(loose, op, targetName, ctx);
      if (typeof outcome === "string") {
        errors.push(outcome);
      } else {
        changes.push(...outcome);
      }
    } catch (e) {
      errors.push(`\u8282\u70B9 ${targetName} ${op.op} \u6267\u884C\u5931\u8D25: ${e.message}`);
    }
  }
  return { workflow: next, changes, errors };
}

// src/schema-converter.ts
function mapNodeType(type) {
  const map = {
    start: "1",
    end: "2",
    llm: "3",
    // 大模型（实测）
    code: "5",
    // 代码（实测）
    condition: "8",
    // 选择器（实测）
    text: "15",
    // 文本处理（实测）
    merge: "32",
    // 变量聚合（实测）
    database_query: "43",
    // 查询数据（实测）
    http: "45"
    // HTTP 请求（实测）
  };
  return map[type] ?? "3";
}
function nodeColor(type) {
  const colors = {
    start: "#52c41a",
    end: "#ff4d4f",
    llm: "#5C62FF",
    code: "#722ed1",
    condition: "#fa8c16",
    text: "#13c2c2",
    merge: "#2f54eb",
    http: "#13c2c2",
    database_query: "#eb2f96"
  };
  return colors[type] ?? "#5C62FF";
}
function modelTypeFor(modelName, map) {
  if (!modelName) return 201;
  if (map && map[modelName]) return map[modelName];
  return 201;
}
function literal(name, type, content) {
  const rawType = type === "boolean" ? 3 : type === "float" ? 4 : type === "integer" ? 2 : 1;
  return {
    name,
    input: {
      type,
      value: { type: "literal", content, rawMeta: { type: rawType } }
    }
  };
}
function refInput(name, blockID, outputName, rawType = 1) {
  return {
    name,
    input: {
      type: rawType === 6 ? "object" : rawType === 2 ? "integer" : "string",
      value: {
        type: "ref",
        content: { source: "block-output", blockID, name: outputName },
        rawMeta: { type: rawType }
      }
    }
  };
}
function convertToPlatformSchema(workflow, modelTypeMap) {
  const idMap = /* @__PURE__ */ new Map();
  for (const node of workflow.nodes) {
    if (node.type === "start") idMap.set(node.id, "100001");
    if (node.type === "end") idMap.set(node.id, "900001");
  }
  const platformId = (id) => idMap.get(id) ?? id;
  const skippedNodeIds = new Set(
    workflow.nodes.filter(
      (n) => n.type === "database_query" && !n.connection
    ).map((n) => n.id)
  );
  const platformNodes = workflow.nodes.map((node, index) => {
    const isStart = node.type === "start";
    const isEnd = node.type === "end";
    const fallbackUpstream = workflow.nodes[index - 1];
    const upstreamNode = isEnd ? workflow.nodes.find(
      (n) => !skippedNodeIds.has(n.id) && workflow.edges.some(
        (e) => e.targetNodeId === node.id && e.sourceNodeId === n.id
      )
    ) ?? (fallbackUpstream && !skippedNodeIds.has(fallbackUpstream.id) ? fallbackUpstream : void 0) : void 0;
    const upstreamId = upstreamNode ? idMap.get(upstreamNode.id) ?? upstreamNode.id : "100001";
    const upstreamOutput = upstreamNode?.type === "start" ? "input" : upstreamNode?.outputs?.[0]?.name ?? "output";
    const data = {
      nodeMeta: {
        title: node.title,
        icon: "",
        description: node.desc ?? "",
        mainColor: nodeColor(node.type),
        subTitle: ""
      }
    };
    if (isStart) {
      const vars = node?.inputVariables;
      const startOutputs = vars && vars.length > 0 ? vars.map((v) => {
        const type = v.type ?? "string";
        const entry = {
          type,
          name: v.name,
          required: v.required ?? true
        };
        if (type === "list") {
          entry.schema = { type: "string" };
        }
        if (v.default !== void 0) {
          entry.defaultValue = v.default;
        }
        return entry;
      }) : [{ type: "string", name: "input", required: false }];
      data.outputs = startOutputs;
      data.trigger_parameters = [];
    }
    if (isEnd) {
      const endVars = node?.outputVariables;
      const inputParameters = endVars && endVars.length > 0 ? endVars.map((v) => {
        const refMatch = v.value ? /^([^.{}]+)\.(.+)$/.exec(v.value) : null;
        return {
          name: v.name ?? "output",
          input: {
            type: "string",
            value: {
              type: "ref",
              content: refMatch ? {
                source: "block-output",
                blockID: platformId(refMatch[1]),
                name: refMatch[2]
              } : {
                source: "block-output",
                blockID: upstreamId,
                name: upstreamOutput
              }
            }
          }
        };
      }) : [
        {
          name: "output",
          input: {
            type: "string",
            value: {
              type: "ref",
              content: {
                source: "block-output",
                blockID: upstreamId,
                name: upstreamOutput
              }
            }
          }
        }
      ];
      data.inputs = {
        terminatePlan: "returnVariables",
        inputParameters
      };
    }
    if (node.type === "llm") {
      const llm = node;
      const inputParameters = Object.entries(llm.inputMapping ?? {}).map(
        ([name, refExpr]) => {
          const match = /^([^.{}]+)\.(.+)$/.exec(refExpr);
          if (match) {
            return refInput(name, platformId(match[1]), match[2]);
          }
          return literal(name, "string", refExpr);
        }
      );
      data.inputs = {
        inputParameters,
        llmParam: [
          literal(
            "temperature",
            "float",
            String(llm.config?.temperature ?? 1)
          ),
          literal(
            "maxTokens",
            "integer",
            String(llm.config?.maxTokens ?? 16384)
          ),
          literal("topP", "float", "0.95"),
          literal("responseFormat", "integer", "2"),
          literal(
            "modleName",
            "string",
            llm.config?.model ?? "Doubao-Seed-2.0-Lite"
          ),
          literal(
            "modelType",
            "integer",
            String(modelTypeFor(llm.config?.model, modelTypeMap))
          ),
          literal("generationDiversity", "string", "balance"),
          literal("supportThinking", "boolean", true),
          literal("enableThinking", "boolean", true),
          literal("apiType", "integer", "1"),
          literal("prompt", "string", llm.userPrompt ?? ""),
          literal("enableChatHistory", "boolean", false),
          literal("chatHistoryRound", "integer", "3"),
          literal("systemPrompt", "string", llm.systemPrompt ?? "")
        ],
        // settingOnError 结构对照平台样本 141264（2026-08-14 实测）：
        // switch + dataOnErr(json字符串) + processType 3=异常分支 + ext.backupLLmParam(json字符串)
        settingOnError: {
          switch: true,
          dataOnErr: JSON.stringify({
            output: "",
            reasoning_content: ""
          }),
          processType: 3,
          timeoutMs: 12e4,
          singleTimeoutMs: 0,
          retryTimes: 1,
          ext: {
            backupLLmParam: JSON.stringify({
              temperature: 1,
              maxTokens: 16384,
              topP: 0.95,
              responseFormat: 2,
              modelName: "Doubao-Seed-2.0-Lite",
              modelType: 201,
              generationDiversity: "default_val"
            })
          }
        }
      };
      const llmOutputs = node?.outputs;
      const businessOutputs = llmOutputs && llmOutputs.length > 0 ? llmOutputs.map((o) => ({
        type: o.type ?? "string",
        name: o.name ?? "output"
      })) : [{ type: "string", name: "output" }];
      data.outputs = [
        ...businessOutputs,
        { type: "string", name: "reasoning_content" },
        {
          type: "object",
          name: "errorBody",
          schema: [
            { type: "string", name: "errorMessage", readonly: true },
            { type: "string", name: "errorCode", readonly: true }
          ],
          readonly: true
        },
        { type: "boolean", name: "isSuccess", readonly: true }
      ];
      data.version = "3";
    }
    if (node.type === "code") {
      const code = node;
      const normalizeSchema = (type, schema) => {
        if (type === "object") {
          return Array.isArray(schema) ? schema : [];
        }
        if (type === "list") {
          if (schema && typeof schema === "object" && !Array.isArray(schema))
            return schema;
          return { type: "string" };
        }
        return void 0;
      };
      const codeOutputs = code.outputs && code.outputs.length > 0 ? code.outputs.map((o) => {
        const type = o.type ?? "object";
        const schema = normalizeSchema(type, o.schema);
        const entry = {
          type,
          name: o.name ?? "output"
        };
        if (schema !== void 0) entry.schema = schema;
        return entry;
      }) : [{ type: "object", name: "output", schema: [] }];
      const inputParameters = Object.entries(code.inputMapping ?? {}).map(
        ([name, refExpr]) => {
          const match = /^([^.{}]+)\.(.+)$/.exec(refExpr);
          if (match) {
            return refInput(name, platformId(match[1]), match[2]);
          }
          return literal(name, "string", refExpr);
        }
      );
      data.inputs = {
        inputParameters,
        code: code.code ?? "async def main(args: Args) -> Output:\n    params = args.params\n    ret: Output = {}\n    return ret",
        language: code.language === "javascript" ? 1 : 3,
        settingOnError: {
          processType: 1,
          timeoutMs: 6e4,
          retryTimes: 0
        }
      };
      data.outputs = codeOutputs;
    }
    if (node.type === "condition") {
      const condition = node;
      const upstreamEdge = workflow.edges.find(
        (e) => e.targetNodeId === node.id
      );
      const upstreamNode2 = upstreamEdge ? workflow.nodes.find((n) => n.id === upstreamEdge.sourceNodeId) : void 0;
      const upstreamOutputName = upstreamNode2?.type === "start" ? "input" : upstreamNode2?.outputs?.[0]?.name ?? "output";
      const upstreamPlatformId = upstreamNode2 ? idMap.get(upstreamNode2.id) ?? upstreamNode2.id : "100001";
      data.inputs = {
        branches: (condition.branches ?? []).map((branch) => ({
          condition: {
            logic: 2,
            conditions: [
              {
                operator: 11,
                left: {
                  input: {
                    type: "boolean",
                    value: {
                      type: "ref",
                      content: {
                        source: "block-output",
                        blockID: upstreamPlatformId,
                        name: upstreamOutputName
                      }
                    }
                  }
                }
              }
            ]
          }
        }))
      };
    }
    if (node.type === "text") {
      const text = node;
      const inputParameters = Object.entries(text.inputMapping ?? {}).map(
        ([name, refExpr]) => {
          const match = /^([^.{}]+)\.(.+)$/.exec(refExpr);
          if (match) {
            return refInput(name, platformId(match[1]), match[2]);
          }
          return literal(name, "string", refExpr);
        }
      );
      const concatParams = text.concatParams ?? [];
      const inferredConcat = inputParameters.length > 0 ? inputParameters.map((p) => `{{${p.name}}}`).join("") : "{{String1}}";
      const templateParam = concatParams.find(
        (p) => p.name === "concatResult"
      );
      const fullConcatParams = [
        {
          name: "concatResult",
          input: {
            type: "string",
            value: {
              type: "literal",
              content: templateParam?.value ?? inferredConcat,
              rawMeta: { type: 1 }
            }
          }
        },
        {
          name: "arrayItemConcatChar",
          input: {
            type: "string",
            value: {
              type: "literal",
              content: "",
              rawMeta: { type: 1 }
            }
          }
        },
        {
          name: "allArrayItemConcatChars",
          input: {
            type: "list",
            schema: {
              type: "object",
              schema: [
                { type: "string", name: "label", required: true },
                { type: "string", name: "value", required: true },
                { type: "boolean", name: "isDefault", required: true }
              ]
            },
            value: {
              type: "literal",
              content: [
                { label: "\u6362\u884C", value: "\n", isDefault: true },
                { label: "\u5236\u8868\u7B26", value: "	", isDefault: true },
                { label: "\u53E5\u53F7", value: "\u3002", isDefault: true },
                { label: "\u9017\u53F7", value: "\uFF0C", isDefault: true },
                { label: "\u5206\u53F7", value: "\uFF1B", isDefault: true },
                { label: "\u7A7A\u683C", value: " ", isDefault: true }
              ]
            }
          }
        }
      ];
      data.inputs = {
        method: text.method ?? "concat",
        inputParameters,
        concatParams: fullConcatParams
      };
      data.outputs = [{ type: "string", name: "output", required: true }];
    }
    if (node.type === "merge") {
      const merge = node;
      const mergeGroups = (merge.mergeGroups ?? [{ name: "Group1", variables: [] }]).map((group) => ({
        name: group.name,
        variables: (group.variables ?? []).map((refExpr) => {
          const match = /^([^.{}]+)\.(.+)$/.exec(refExpr);
          if (match) {
            return {
              type: "string",
              value: {
                type: "ref",
                content: {
                  source: "block-output",
                  blockID: platformId(match[1]),
                  name: match[2]
                },
                rawMeta: { type: 1 }
              }
            };
          }
          return {
            type: "string",
            value: {
              type: "literal",
              content: refExpr,
              rawMeta: { type: 1 }
            }
          };
        })
      }));
      data.inputs = { mergeGroups };
      data.outputs = mergeGroups.map((g) => ({
        type: "string",
        name: g.name
      }));
    }
    if (node.type === "database_query") {
      const db = node;
      if (!db.connection) {
        return null;
      }
      const inputParameters = Object.entries(db.inputMapping ?? {}).map(
        ([name, refExpr]) => {
          const match = /^([^.{}]+)\.(.+)$/.exec(refExpr);
          if (match) {
            return refInput(name, platformId(match[1]), match[2]);
          }
          return literal(name, "string", refExpr);
        }
      );
      const rawSel = node?._temp?.externalData?.platformRaw?.selectParam;
      data.inputs = {
        databaseInfoList: [{ databaseInfoID: db.connection ?? "" }],
        selectParam: rawSel ?? {
          condition: {
            conditionList: [[]],
            logic: "AND"
          },
          orderByList: [],
          limit: 100
        },
        settingOnError: {
          processType: 1,
          timeoutMs: 6e4,
          retryTimes: 0
        },
        ...inputParameters.length > 0 ? { inputParameters } : {}
      };
      data.outputs = [
        {
          type: "list",
          name: "outputList",
          schema: { type: "object", schema: [] }
        },
        { type: "integer", name: "rowNum" }
      ];
    }
    if (node.type === "http") {
      const http = node;
      const inputParameters = Object.entries(http.inputMapping ?? {}).map(
        ([name, refExpr]) => {
          const match = /^([^.{}]+)\.(.+)$/.exec(refExpr);
          if (match) {
            return refInput(name, platformId(match[1]), match[2]);
          }
          return literal(name, "string", refExpr);
        }
      );
      let url = http.url ?? "";
      for (const [name, refExpr] of Object.entries(http.inputMapping ?? {})) {
        const match = /^([^.{}]+)\.(.+)$/.exec(refExpr);
        if (!match) continue;
        const blockID = platformId(match[1]);
        const outputName = match[2];
        const fullRef = `{{block_output_${blockID}.${outputName}}}`;
        url = url.replaceAll(`{{${name}}}`, fullRef);
        url = url.replaceAll(`{${name}}`, fullRef);
      }
      data.inputs = {
        apiInfo: {
          method: http.method ?? "GET",
          url
        },
        body: {
          bodyType: "EMPTY",
          // 平台默认大写 EMPTY
          bodyData: {
            binary: {
              fileURL: {
                type: "string",
                value: {
                  type: "ref",
                  content: {
                    source: "block-output",
                    blockID: "",
                    name: ""
                  }
                }
              }
            }
          }
        },
        headers: [],
        params: [],
        auth: {
          authType: "BEARER_AUTH",
          authData: {
            customData: {
              addTo: "header"
            }
          },
          authOpen: false
        },
        setting: {
          timeout: 120,
          // 秒
          retryTimes: 3
        },
        // inputParameters 让平台知道 URL 中的 {{city}} 来自 start 节点的哪个输出
        ...inputParameters.length > 0 ? { inputParameters } : {}
      };
      data.outputs = [
        { type: "string", name: "body" },
        { type: "integer", name: "statusCode" },
        { type: "string", name: "headers" }
      ];
    }
    return {
      id: platformId(node.id),
      type: mapNodeType(node.type),
      meta: { position: { x: 100 + index * 200, y: 100 } },
      data,
      _temp: {
        bounds: { x: 0, y: 0, width: 200, height: 80 },
        externalData: {}
      }
    };
  }).filter((n) => n !== null);
  const platformEdges = workflow.edges.filter(
    (edge) => !skippedNodeIds.has(edge.sourceNodeId) && !skippedNodeIds.has(edge.targetNodeId)
  ).map((edge) => {
    const e = {
      sourceNodeID: platformId(edge.sourceNodeId),
      targetNodeID: platformId(edge.targetNodeId)
    };
    if (edge.sourcePort) {
      e.sourcePortID = edge.sourcePort;
    }
    return e;
  });
  const platformSchema = {
    versions: { loop: "v2" },
    nodes: platformNodes,
    edges: platformEdges
  };
  return JSON.stringify(platformSchema);
}

// scripts/coze-update.mjs
var CRED_PATH = import_node_path.default.join((0, import_node_os.homedir)(), ".coze", "credentials.json");
function loadCred() {
  return JSON.parse((0, import_node_fs.readFileSync)(CRED_PATH, "utf8"));
}
async function call(cred, api, body, prefix = "/api/workflow_api/") {
  const res = await fetch(`${cred.origin}${prefix}${api}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_key=${cred.session_key}`,
      "Agw-Js-Conv": "str",
      "x-requested-with": "XMLHttpRequest"
    },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`CozeError[${json.code}]: ${json.msg}`);
  return json;
}
async function main() {
  const [wfId, opsFile, ...rest] = process.argv.slice(2);
  const spaceIdx = rest.indexOf("--space");
  const spaceId = spaceIdx >= 0 ? rest[spaceIdx + 1] : void 0;
  if (!wfId || !opsFile) {
    console.error("\u7528\u6CD5: node coze-update.cjs <workflowId> <ops.json> [--space X]");
    process.exit(1);
  }
  const cred = loadCred();
  const sid = spaceId ?? cred.space_id;
  console.log(`1) \u62C9\u53D6\u5DE5\u4F5C\u6D41 ${wfId} \u6700\u65B0 schema...`);
  const canvas = await call(cred, "canvas", { workflow_id: wfId, space_id: sid });
  const schemaJson = canvas.data.workflow.schema_json;
  const converted = platformToProject(schemaJson);
  const workflow = converted.workflow;
  const ops = JSON.parse((0, import_node_fs.readFileSync)(opsFile, "utf8"));
  if (!Array.isArray(ops)) {
    console.error("\u274C ops.json \u5FC5\u987B\u662F\u6570\u7EC4");
    process.exit(1);
  }
  console.log(`2) \u6267\u884C ${ops.length} \u6761\u64CD\u4F5C...`);
  const result = await applyOperations(workflow, ops, {
    codeGenerator: {
      generateCode: async () => {
        throw new Error("skill \u65E0\u5185\u7F6E\u4EE3\u7801\u751F\u6210\u5668\uFF0C\u8BF7\u7528 rewrite_code \u65F6\u4F20 code \u5B57\u6BB5");
      }
    }
  });
  if (result.changes.length === 0) {
    console.error(`\u274C \u65E0\u6709\u6548\u4FEE\u6539: ${result.errors.join("; ")}`);
    process.exit(1);
  }
  for (const c of result.changes) console.log(`   \u2705 ${c}`);
  for (const e of result.errors) console.warn(`   \u26A0\uFE0F  ${e}`);
  const newSchemaJson = convertToPlatformSchema(result.workflow);
  console.log("3) \u4FDD\u5B58...");
  await call(cred, "edit_lock", { workflow_id: wfId, space_id: sid, action: "acquire" });
  const cur = await call(cred, "canvas", { workflow_id: wfId, space_id: sid });
  await call(cred, "save", {
    workflow_id: wfId,
    schema: newSchemaJson,
    space_id: sid,
    submit_commit_id: cur.data.vcs_data.submit_commit_id,
    ignore_status_transfer: true
  });
  console.log(`\u2705 \u5DF2\u4FDD\u5B58: ${wfId}\uFF08${result.changes.length} \u9879\u4FEE\u6539\u751F\u6548\uFF09`);
}
main().catch((e) => {
  console.error("\u274C", e.message);
  process.exit(1);
});
