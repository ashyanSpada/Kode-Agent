# Configuration System

## Overview

Kode uses a sophisticated multi-level configuration system that allows customization at global, project, and runtime levels. Configuration cascades from global defaults through project-specific settings to runtime overrides.

## Configuration Hierarchy

```
Environment Variables (Highest Priority)
           ↓
    Runtime Flags (CLI)
           ↓
  Project Settings (./.kode/settings.json)
           ↓
 Global Config (~/.kode.json by default)
           ↓
      Default Values (Lowest Priority)
```

## Configuration Files

### Global Configuration
**Location**:
- Default: `~/.kode.json`
- If `KODE_CONFIG_DIR` or `CLAUDE_CONFIG_DIR` is set: `<that-dir>/config.json`

```json
{
  "theme": "dark",
  "hasCompletedOnboarding": true,
  "modelProfiles": [
    {
      "name": "Claude Sonnet",
      "provider": "anthropic",
      "modelName": "claude-sonnet-4-20250514",
      "apiKey": "***",
      "maxTokens": 8192,
      "contextLength": 200000,
      "isActive": true,
      "createdAt": 1710000000000
    }
  ],
  "modelPointers": {
    "main": "claude-sonnet-4-20250514",
    "task": "claude-sonnet-4-20250514",
    "compact": "claude-sonnet-4-20250514",
    "quick": "claude-sonnet-4-20250514"
  },
  "mcpServers": {},
  "customApiKey": null,
  "autoUpdaterStatus": "enabled",
  "numStartups": 42
}
```

### Project Settings
**Location**: `./.kode/settings.json` (local overrides in `./.kode/settings.local.json`)

```json
{
  "enableArchitectTool": false,
  "allowedCommands": [
    "git *",
    "npm *",
    "bun *"
  ],
  "approvedTools": [
    "file_read",
    "file_edit",
    "bash"
  ],
  "context": {
    "projectName": "my-project",
    "description": "Project description"
  },
  "mcpServers": {},
  "lastCost": 0.0234,
  "lastDuration": 45000
}
```

## Configuration Schema

### Model Configuration

#### Model Profiles
Define reusable AI model configurations:

```typescript
interface ModelProfile {
  name: string
  provider: string
  modelName: string
  baseURL?: string
  apiKey: string
  maxTokens: number
  contextLength: number
  isActive: boolean
  createdAt: number
}
```

#### Model Pointers
Map roles to model profiles:

```typescript
interface ModelPointers {
  main: string      // Primary conversation model
  task: string      // Task execution model
  compact: string   // Context compaction model
  quick: string     // Fast responses model
}
```

### MCP Server Configuration

```typescript
interface MCPServerConfig {
  type: 'stdio' | 'sse'
  // For stdio servers
  command?: string
  args?: string[]
  env?: Record<string, string>
  // For SSE servers
  url?: string
}

interface MCPServers {
  [serverName: string]: MCPServerConfig
}
```

### Permission Configuration

```typescript
interface PermissionConfig {
  // Approved shell command patterns
  allowedCommands: string[]
  
  // Approved tool names
  approvedTools: string[]
  
  // File/directory access patterns
  allowedPaths: string[]
  
  // Rejected MCP servers
  rejectedMcprcServers: string[]
  
  // Approved MCP servers
  approvedMcprcServers: string[]
}
```

### UI Configuration

```typescript
interface UIConfig {
  theme: 'dark' | 'light'
  compactMode: boolean
  showCosts: boolean
  syntaxHighlighting: boolean
  vimKeybindings: boolean
  shiftEnterKeyBindingInstalled: boolean
}
```

## Configuration Management API

### Reading Configuration

```typescript
import { getGlobalConfig, getCurrentProjectConfig } from './utils/config'

// Get global configuration
const globalConfig = getGlobalConfig()

// Get project configuration
const projectConfig = getCurrentProjectConfig()

// Get merged configuration (project overrides global)
const config = {
  ...globalConfig,
  ...projectConfig
}
```

### Writing Configuration

```typescript
import { saveGlobalConfig, saveCurrentProjectConfig } from './utils/config'

// Update global configuration
saveGlobalConfig({
  ...getGlobalConfig(),
  theme: 'light'
})

// Update project configuration
saveCurrentProjectConfig({
  ...getCurrentProjectConfig(),
  enableArchitectTool: true
})
```

### CLI Configuration Commands

```bash
# Get configuration value (limited to config keys)
kode config get theme
kode config get -g primaryProvider

# Set configuration value
kode config set theme dark
kode config set -g autoUpdaterStatus enabled

# Manage models (profiles + pointers)
kode models list
kode models set-pointer main my-profile
kode models add-profile --name my-profile --provider openai --model-name gpt-4.1 --api-key "$OPENAI_API_KEY"

# List all configuration
kode config list
kode config list -g
```

## Environment Variables

### Core Variables

> Anthropic environment overrides are disabled—configure Anthropic keys in Kode settings instead.

```bash
# API Keys
OPENAI_API_KEY=sk-...

# Config location overrides
KODE_CONFIG_DIR=/path/to/kode-config
CLAUDE_CONFIG_DIR=/path/to/compat-config

# Provider routing flags
KODE_USE_BEDROCK=1
KODE_USE_VERTEX=1

# Feature Flags
ENABLE_ARCHITECT_TOOL=true
DEBUG_MODE=true
VERBOSE=true

# MCP Configuration
MCP_SERVER_URL=http://localhost:3000
MCP_TIMEOUT=30000

# Development
NODE_ENV=development
LOG_LEVEL=debug
```

### Precedence Rules

Environment variables override configuration files (Anthropic keys excluded):
1. Check environment variable
2. Check project configuration
3. Check global configuration
4. Use default value

## Configuration Migration

### Version Migration

The system automatically migrates old configuration formats:

```typescript
function migrateConfig(config: any): Config {
  // v1 to v2: Rename fields
  if (config.iterm2KeyBindingInstalled) {
    config.shiftEnterKeyBindingInstalled = config.iterm2KeyBindingInstalled
    delete config.iterm2KeyBindingInstalled
  }
  
  // v2 to v3: Update model format
  if (typeof config.model === 'string') {
    config.modelProfiles = {
      default: {
        type: 'anthropic',
        model: config.model
      }
    }
    delete config.model
  }
  
  return config
}
```

### Backup and Recovery

Configuration files are backed up before changes:

```typescript
function saveConfigWithBackup(config: Config) {
  // Create backup
  const backupPath = `${configPath}.backup`
  fs.copyFileSync(configPath, backupPath)
  
  try {
    // Save new configuration
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  } catch (error) {
    // Restore from backup on error
    fs.copyFileSync(backupPath, configPath)
    throw error
  }
}
```

## Configuration Validation

### Schema Validation

Using Zod for runtime validation:

```typescript
const ConfigSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  modelProfiles: z.array(ModelProfileSchema).optional(),
  modelPointers: ModelPointersSchema.optional(),
  mcpServers: z.record(MCPServerConfigSchema).optional(),
  // ... other fields
})

function loadConfig(path: string): Config {
  const raw = JSON.parse(fs.readFileSync(path, 'utf-8'))
  return ConfigSchema.parse(raw)
}
```

### Validation Rules

1. **API Keys**: Must match expected format
2. **Model Names**: Must be valid model identifiers
3. **URLs**: Must be valid URLs for endpoints
4. **Paths**: Must be valid file system paths
5. **Commands**: Must not contain dangerous patterns

## Configuration Scopes

### Global Scope
Affects all projects:
- User preferences (theme, keybindings)
- Model profiles and API keys
- Global MCP servers
- Auto-updater settings

### Project Scope
Specific to current project:
- Tool permissions
- Allowed commands
- Project context
- Local MCP servers
- Cost tracking

### Session Scope
Temporary for current session:
- Runtime flags
- Temporary permissions
- Active MCP connections
- Current model selection

## Advanced Configuration

### Custom Model Providers

```json
{
  "modelProfiles": [
    {
      "name": "custom-llm",
      "provider": "custom-openai",
      "modelName": "my-model-v1",
      "baseURL": "https://my-llm-api.com/v1",
      "apiKey": "custom-key",
      "maxTokens": 4096,
      "contextLength": 128000,
      "isActive": true,
      "createdAt": 1710000000000
    }
  ]
}
```

### llama.cpp Provider

Kode can connect to an existing `llama-server` or manage a local
`llama-server` process for GGUF models. Both modes use llama.cpp's
OpenAI-compatible endpoints (`/v1/models` and `/v1/chat/completions`).

Existing server profile:

```json
{
  "modelProfiles": [
    {
      "name": "Local llama.cpp",
      "provider": "llama-cpp",
      "modelName": "model.gguf",
      "baseURL": "http://127.0.0.1:8080/v1",
      "apiKey": "no-key",
      "maxTokens": 8192,
      "contextLength": 8192,
      "isActive": true,
      "createdAt": 1710000000000,
      "llamaCpp": {
        "mode": "existing",
        "host": "127.0.0.1",
        "port": 8080,
        "autoStart": false
      }
    }
  ]
}
```

Managed local profile:

```json
{
  "modelProfiles": [
    {
      "name": "Managed llama.cpp",
      "provider": "llama-cpp",
      "modelName": "mistral.Q4_K_M.gguf",
      "baseURL": "http://127.0.0.1:8080/v1",
      "apiKey": "no-key",
      "maxTokens": 8192,
      "contextLength": 8192,
      "isActive": true,
      "createdAt": 1710000000000,
      "llamaCpp": {
        "mode": "managed",
        "binaryPath": "/usr/local/bin/llama-server",
        "modelPath": "/models/mistral.Q4_K_M.gguf",
        "host": "127.0.0.1",
        "port": 8080,
        "ctxSize": 8192,
        "threads": 8,
        "gpuLayers": 35,
        "extraArgs": ["--parallel", "2"],
        "autoStart": true
      }
    }
  ]
}
```

CLI helpers:

```bash
kode models llama-cpp status
kode models llama-cpp start --binary /usr/local/bin/llama-server --gguf /models/model.gguf
kode models llama-cpp stop
kode models llama-cpp add-profile --name "Local llama.cpp" --binary /usr/local/bin/llama-server --gguf /models/model.gguf --ctx-size 8192 --threads 8 --gpu-layers 35
```

### MCP Server Examples

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {
        "ALLOWED_DIRECTORIES": "/home/user/projects"
      }
    },
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "web-api": {
      "type": "sse",
      "url": "https://api.example.com/mcp"
    }
  }
}
```

### Context Configuration

```json
{
  "context": {
    "projectType": "typescript",
    "framework": "react",
    "testingFramework": "jest",
    "buildTool": "webpack",
    "customContext": "This project uses a custom state management solution..."
  }
}
```

## Configuration Best Practices

### 1. Security
- Never commit API keys to version control
- Use environment variables for secrets
- Validate all configuration inputs
- Limit command permissions appropriately

### 2. Organization
- Keep global config for user preferences
- Use project config for project-specific settings
- Document custom configuration in README
- Version control project configuration

### 3. Performance
- Cache configuration in memory
- Reload only when files change
- Use efficient JSON parsing
- Minimize configuration file size

### 4. Debugging
- Use verbose mode for configuration issues
- Check configuration with `config list`
- Validate configuration on load
- Log configuration errors clearly

## Troubleshooting

### Common Issues

1. **Configuration Not Loading**
   - Check file permissions
   - Validate JSON syntax
   - Ensure correct file path

2. **Settings Not Applied**
   - Check configuration hierarchy
   - Verify environment variables
   - Clear configuration cache

3. **Migration Failures**
   - Restore from backup
   - Manually update format
   - Check migration logs

### Debug Commands

```bash
# Show configuration
kode config list

# Show model diagnostics (includes config path)
kode models list
```

The configuration system provides flexible, secure, and robust management of all Kode settings while maintaining backward compatibility and user-friendly defaults.
