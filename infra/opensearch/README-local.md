# OpenSearch Local Dev

This folder contains a local Windows OpenSearch setup for Intelligent-Edu-Platform.

## Layout

- `opensearch-3.7.0/`: downloaded OpenSearch distribution
- `runtime/data/`: local index data
- `runtime/logs/`: OpenSearch logs
- `start-opensearch-dev.ps1`: start local OpenSearch
- `stop-opensearch-dev.ps1`: stop local OpenSearch
- `status-opensearch-dev.ps1`: check local status

## Current local config

- single-node cluster
- `http://127.0.0.1:9200`
- security plugin disabled for local development only
- data and logs stored outside the distribution folder

## Commands

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\opensearch\start-opensearch-dev.ps1
powershell -ExecutionPolicy Bypass -File .\infra\opensearch\status-opensearch-dev.ps1
powershell -ExecutionPolicy Bypass -File .\infra\opensearch\stop-opensearch-dev.ps1
```

## Notes

- Do not expose this setup to public networks.
- For production, re-enable security and TLS before any shared deployment.
