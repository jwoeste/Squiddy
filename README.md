# Squiddy

Squiddy is a serverless workflow engine built on AWS Lambda and .NET 8.

The current scaffold models:

- workflow definitions with explicit authoring metadata, initial status, and status-level transitions
- manual and automatic transitions with condition rules
- optimistic versioning for workflow definitions and workflow instances
- explicit instance creation plus a command API for manual transitions
- SQLite persistence for workflow definitions, workflow instances, and audit history

## Structure

- `src/Squiddy.Serverless` - Lambda function, workflow engine domain, and SQLite persistence
- `template.yaml` - AWS SAM template for deployment

## API

- `GET /` - service metadata
- `GET /workflows` - lists workflow definitions from SQLite
- `GET /workflows/{workflowId}` - returns one workflow definition from SQLite
- `POST /workflows` - creates or updates a workflow definition with optimistic version checks
- `DELETE /workflows/{workflowId}` - deletes a workflow definition and related local activity
- `POST /workflows/evaluate` - evaluates a workflow definition in-memory
- `GET /workflow-instances` - lists persisted workflow instances from SQLite
- `POST /workflow-instances` - creates a new workflow instance from the workflow's initial status
- `POST /workflow-instances/{instanceId}/commands` - applies a manual command and then any eligible automatic transitions
- `GET /workflow-instances/{instanceId}` - returns persisted workflow instance state
- `GET /workflow-instances/{instanceId}/audit-trail` - returns the transactional audit trail for a workflow instance

Example request:

```json
{
  "workflow": {
    "id": "underwriting",
    "version": 3,
    "name": "Underwriting Workflow",
    "description": "Underwriting workflow with automatic approval and manual review.",
    "initialStatus": "Submitted",
    "statuses": [
      {
        "code": "Submitted",
        "name": "Submitted",
        "description": "The application is waiting for automation or referral.",
        "isTerminal": false,
        "actions": [
          {
            "code": "AUTO_APPROVE",
            "name": "Auto Approve",
            "description": "Automatically approves low-risk complete applications.",
            "targetStatus": "Approved",
            "mode": "Automatic",
            "conditions": [
              { "key": "riskScore", "operator": "Equals", "expectedValue": "LOW" },
              { "key": "documentsComplete", "operator": "Equals", "expectedValue": "true" }
            ]
          }
        ]
      },
      {
        "code": "Approved",
        "name": "Approved",
        "description": "The application has been approved.",
        "isTerminal": true,
        "actions": []
      }
    ]
  },
  "currentStatus": "Submitted",
  "context": {
    "riskScore": "LOW",
    "documentsComplete": "true"
  }
}
```

Example workflow definition save:

```json
{
  "expectedVersion": 3,
  "workflow": {
    "id": "underwriting",
    "version": 3,
    "name": "Underwriting Workflow",
    "description": "Underwriting workflow with automatic approval and manual review.",
    "initialStatus": "Draft",
    "statuses": [
      {
        "code": "Draft",
        "name": "Draft",
        "description": "Application is being assembled.",
        "isTerminal": false,
        "actions": []
      }
    ]
  }
}
```

Example workflow instance creation:

```json
{
  "workflowId": "underwriting",
  "instanceId": "application-123",
  "context": {
    "riskScore": "LOW",
    "documentsComplete": "true"
  }
}
```

Example manual command:

```json
{
  "commandCode": "REFER",
  "expectedVersion": 1,
  "context": {
    "underwriterAssigned": "jwoeste"
  }
}
```

## Prerequisites

- .NET 10 SDK/runtime for the local debug host and a SDK capable of building `net8.0` projects
- AWS SAM CLI
- AWS credentials configured for deployment

## Run locally

```bash
sam build
sam local start-api
```

Then call `http://127.0.0.1:3000/`.

By default the SQLite file is stored at `data/squiddy.db` locally and `/tmp/squiddy.db` in AWS Lambda. Override with `SQUIDDY_DB_PATH`.

## Build and Debug

VS Code assets are included:

- [launch.json](/Users/jenswoeste/src/Squiddy/.vscode/launch.json) launches a local ASP.NET Core debug host with Swagger that invokes the Lambda handler
- [tasks.json](/Users/jenswoeste/src/Squiddy/.vscode/tasks.json) restores and builds the solution
- [Squiddy.sln](/Users/jenswoeste/src/Squiddy/Squiddy.sln) groups the Lambda project and the local debug host

The debug host lives in `src/Squiddy.DebugHost` and lets you step through the Lambda code without deploying. Swagger UI is exposed locally at `http://localhost:5056/swagger`.

Example commands:

```bash
dotnet restore Squiddy.sln
dotnet build Squiddy.sln
dotnet run --project src/Squiddy.DebugHost --launch-profile Squiddy.DebugHost
```

The `Squiddy.DebugHost` launch profile is the canonical local entry point. It sets the app URL to `http://localhost:5056`, opens Swagger automatically, and uses `data/squiddy.db` for the local SQLite store.

The Lambda project itself still targets `net8.0`, but the local debug host targets `net10.0` so it can run on machines that only have the current .NET 10 runtime installed.

The debug host also serves a dashboard at `http://localhost:5056/dashboard` for browsing workflow definitions and recent instance activity.

## Deploy

```bash
sam build
sam deploy --guided
```

## Notes

SQLite on AWS Lambda is still ephemeral unless you mount persistent storage such as EFS, so this persistence layer is suitable for local development and simple deployments but not durable production state by itself.
