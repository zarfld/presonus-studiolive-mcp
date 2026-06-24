which programming languange should be used?

## Recommendation: **TypeScript / Node.js**

Use **TypeScript** for the MCP server.

Reason: both critical dependencies are already TypeScript/Node-native:

| Component                             |      Best-fit language | Reason                                                                                                                                                                              |
| ------------------------------------- | ---------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `featherbear/presonus-studiolive-api` | **TypeScript/Node.js** | The package is installed via npm and is itself a TypeScript/Node library for StudioLive III mixers. It is documented as tested with StudioLive 16, 16R, 24R and 32SC. ([GitHub][1]) |
| MCP SDK                               | **TypeScript/Node.js** | The official MCP TypeScript SDK supports MCP servers, resources, prompts and tools, and runs on Node.js, Bun and Deno. ([GitHub][2])                                                |
| Schema validation                     |   **TypeScript + Zod** | Directly useful for exact MCP JSON schema definitions and runtime validation.                                                                                                       |
| API probing                           |         **TypeScript** | You can inspect the imported package, types, runtime events and state structures without a language bridge.                                                                         |

So the cleanest stack is:

```text
TypeScript
Node.js 22 LTS or current LTS
pnpm
@modelcontextprotocol/sdk
@featherbear/presonus-studiolive-api
zod
vitest
ts-morph
typedoc
```

---

# Why not C# first?

C# is tempting because you work a lot in C#, but for this specific project it adds friction:

```text
C# MCP server
  ↓
bridge to Node process
  ↓
featherbear TypeScript API
  ↓
StudioLive mixer
```

That creates extra complexity around:

* process supervision
* JSON IPC
* type duplication
* event streaming
* reconnect handling
* debugging
* schema drift

For the first working version, that is not worth it.

C# can still make sense later for:

```text
desktop GUI
Windows tray app
show-preparation editor
AVB/Milan integration with your existing repos
integration with other .NET tooling
```

But the **MCP server core** should be TypeScript.

---

# Recommended language split

## Phase 1: TypeScript only

```text
presonus-mcp/
  TypeScript MCP server
  TypeScript PreSonus adapter
  TypeScript probe CLI
  TypeScript schema generator
```

This gives you the shortest path to:

```text
discover mixers
dump state
observe raw API structures
map Fat Channel enums
expose MCP resources/tools
validate JSON structures
```

## Phase 2: Optional C# companion app

Later:

```text
C# WPF / WinUI / Avalonia app
  ↓
talks to local TypeScript MCP/helper service
  ↓
visualizes mixer graph, rider patch plan, validation results
```

This lets C# do what it is good at for you: Windows UI, tooling, integration.

## Phase 3: Optional AVB/Milan backend

For deeper routing validation:

```text
C/C++/C#/Rust AVB/Milan scanner
  ↓
exports JSON
  ↓
TypeScript MCP server consumes it
```

This would connect to your existing AVB/Milan work later. Do not block the PreSonus MCP MVP on this.

---

# Concrete project choice

Use:

```text
Language: TypeScript
Runtime: Node.js 22+
Package manager: pnpm
Module system: ESM
Schema library: Zod
Tests: Vitest
Type inspection: ts-morph
Docs: TypeDoc
Transport first: MCP stdio
Transport later: HTTP/SSE only if needed
```

---

# Practical repository structure

```text
presonus-mcp/
  package.json
  tsconfig.json

  src/
    index.ts

    mcp/
      server.ts
      resources.ts
      tools.ts
      prompts.ts

    presonus/
      discovery.ts
      client-manager.ts
      state-cache.ts
      state-mapper.ts
      meter-summarizer.ts
      fat-channel-mapper.ts

    schemas/
      mixer.ts
      channel.ts
      fat-channel.ts
      routing.ts
      metering.ts
      show.ts
      tools.ts

    cli/
      probe.ts
      inventory.ts
      diff-state.ts

  captures/
  docs/generated/
  test/
```

---

# Main reason

The first hard problem is not performance or GUI. The hard problem is:

```text
discover exact StudioLive state structures
map raw API values to stable domain models
generate correct MCP schemas
validate Fat Channel models and enums
avoid unsafe control behavior
```

TypeScript gives you the most direct access to the existing PreSonus API and the MCP SDK. Use it for the core.

[1]: https://github.com/featherbear/presonus-studiolive-api?utm_source=chatgpt.com "featherbear/presonus-studiolive-api: Exploring the ..."
[2]: https://github.com/modelcontextprotocol/typescript-sdk?utm_source=chatgpt.com "modelcontextprotocol/typescript-sdk: The official ..."
