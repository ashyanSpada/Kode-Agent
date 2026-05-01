## 2026-04-26 16:25
- Implemented first-class llama.cpp provider support with OpenAI-compatible routing.
- Added managed local `llama-server` lifecycle support for GGUF models, including startup, status, and stop flows.
- Added UI and CLI setup paths for existing llama.cpp servers and managed local runtimes.
- Added focused tests and configuration documentation for llama.cpp profiles.

## 2026-04-26 16:32
- 背景/Context: 支持 llama.cpp 作为本地 GGUF 模型提供商，并补齐托管 `llama-server` 的启动、状态和停止能力 / Added llama.cpp as a local GGUF model provider with managed `llama-server` lifecycle support.
- 提交摘要/Commit: feat: add llama.cpp provider support.
- 文件/File: `src/services/ai/llamaCppRuntime.ts`、`src/ui/components/model-selector/ModelSelector.tsx`、`src/entrypoints/cli/runCli.tsx`、`docs/develop/configuration.md`。
- 破坏性变更/Breaking: 无 / None.

## 2026-04-27 20:34
- Improved Manage Model List so adding models can reuse existing provider credentials and API base URLs.
- Preserved environment API key overrides while falling back to configured local model profiles.
- Added focused coverage for selecting reusable provider credentials.

## 2026-04-30 20:34
- 背景/Context: 增强会话 JSONL 可追溯性与回放能力，补齐顺序序号与关键响应元数据持久化 / Improved session JSONL traceability and replay by persisting sequence numbers and response metadata.
- 提交摘要/Commit: feat: improve session trace persistence and replay metadata.
- 文件/File: `src/utils/protocol/kodeAgentSessionLog.ts`、`src/utils/protocol/kodeAgentTrace.ts`、`tests/unit/session-jsonl-persistence.test.ts`。
- 破坏性变更/Breaking: 无 / None.

## 2026-04-30 20:59
- 背景/Context: 修复隐藏技能命令在 Slash 输入、补全列表和 ACP 可用命令中的可见性不一致问题 / Aligned hidden skill command visibility across slash input, completion suggestions, and ACP available-command reporting.
- 提交摘要/Commit: fix: expose hidden skill commands for slash invocation surfaces.
- 文件/File: `src/commands/index.ts`、`src/entrypoints/cli/printMode.ts`、`src/utils/completion/slashCommandSuggestions.ts`、`src/acp/kodeAcpAgent.ts`、`tests/unit/agent-skills-compat.test.ts`。
- 破坏性变更/Breaking: 无 / None.

## 2026-05-01 16:50
- 背景/Context: 新增 trace replay 命令与补全支持，用于复放并校验会话 JSONL 轨迹完整性 / Added trace replay command and completion support to replay and validate session JSONL trace integrity.
- 提交摘要/Commit: feat: add trace replay command and completion support.
- 文件/File: `src/commands/trace.ts`、`src/utils/protocol/kodeAgentTraceReplay.ts`、`src/utils/completion/traceReplaySuggestions.ts`、`src/utils/completion/context.ts`、`tests/unit/trace-replay.test.ts`。
- 破坏性变更/Breaking: 无 / None.
