# Chat

A technical orchestration layer and web interface designed for Large Language Model (LLM) interactions. It provides a unified API backend and a frontend optimized for developer workflows, featuring artifact rendering and integrated workspace management.

## Technical Architecture

### Unified LLM Proxy
* **OpenAI-Compatible API**: Centralizes backends including OpenAI, Anthropics, and Ollama into a single endpoint.
* **Credential Orchestration**: Implements multi-key rotation and automatic failover handling for rate limits and provider errors.
* **Intelligent Tool Fallback**: Automatically retries requests without function calling parameters if the target model lacks native tool support, injecting relevant system instructions.
* **Model Aliasing**: Configurable mapping of custom model identifiers to specific provider backends.

### Interface Implementation
* **Artifacts System**: Side-panel rendering for code execution, document previews, and web content.
* **Mermaid Integration**: Systematic rendering of Mermaid.js diagrams.
* **Reasoning Parsing**: Native extraction and display of internal reasoning chains in collapsible blocks.
* **Contextual Suggestions**: History-based generation of follow-up interaction points.

### Client-Side Tool Support
* **Extensible Tool Engine**: Frontend-orchestrated tool execution allowing for complex interactions without backend modification.
* **Utility Suite**: Built-in support for formatters (JSON, Base64), generators (UUID, Hash, Random), and mathematical operations.
* **Environment Tools**: Real-time time acquisition, color manipulation, and placeholder generation.
* **Web Integrations**: Direct client-side access to browser geolocation APIs and third-party services (Search, Geospace).

### Workspace Environment
* **Containerized Isolation**: Each conversation session is bounded to a persistent Docker container for secure file operations.
* **Synchronized Terminal**: Browser-based terminal interface with real-time bidirectional synchronization with the workspace container.
* **File Processing**: Support for vision-based image analysis and automated document parsing into context.

### Data and Integrations
* **Persistence Layer**: Differential (delta) synchronization of conversation history for low-latency persistence.
* **Identity Management**: Optional PostgreSQL-based authentication and user session management.

## Tech Stack
* **Backend**: Go (proxy logic and tool synchronization)
* **Frontend**: React with TailwindCSS
* **Runtime**: Bun (package management and build tooling)
* **Process Management**: Docker (workspace isolation)
* **Storage**: PostgreSQL (identity and history)

## Configuration
The system is configured via `config.json` or environment variables:
* `LLMROUTER_API_KEY`: API key for endpoint security.
* `DATABASE_URL`: Connection string for history and identity persistence.
* `EXA_API_KEY`: API key for search tool functionality.
* `GEOAPIFY_API_KEY`: API key for geospatial tool functionality.
* `PORT`: Listening port for the unified server.
