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
