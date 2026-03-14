# Squiddy

Squiddy is a serverless workflow engine built on AWS Lambda and .NET 8.

The current scaffold models:

- workflow definitions made up of statuses and transition actions
- status-specific actions
- STP actions that can be applied automatically when their conditions are met
- evaluation of the current workflow state against a runtime context
- SQLite persistence for workflow definitions and workflow instances

## Structure

- `src/Squiddy.Serverless` - Lambda function, workflow engine domain, and SQLite persistence
- `template.yaml` - AWS SAM template for deployment

## API

- `GET /` - service metadata
- `GET /workflows` - lists workflow definitions from SQLite
- `GET /workflows/{workflowId}` - returns one workflow definition from SQLite
- `POST /workflows` - creates or updates a workflow definition in SQLite
- `DELETE /workflows/{workflowId}` - deletes a workflow definition and related local activity
- `POST /workflows/evaluate` - evaluates a workflow definition and stores it if it has an id
- `GET /workflow-instances` - lists persisted workflow instances from SQLite
- `POST /workflow-instances/evaluate` - evaluates a stored workflow, persists instance state, and auto-applies matching STP actions
- `GET /workflow-instances/{instanceId}` - returns persisted workflow instance state
- `GET /workflow-instances/{instanceId}/audit-trail` - returns the transactional audit trail for a workflow instance

Example request:

```json
{
  "workflow": {
    "id": "underwriting",
    "name": "Underwriting Workflow",
    "statuses": [
      {
        "code": "Submitted",
        "name": "Submitted",
        "actions": [
          {
            "code": "AUTO_APPROVE",
            "name": "Auto Approve",
            "targetStatus": "Approved",
            "isStraightThroughProcessing": true,
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

Example persisted instance evaluation:

```json
{
  "workflowId": "underwriting",
  "instanceId": "application-123",
  "currentStatus": "Submitted",
  "context": {
    "riskScore": "LOW",
    "documentsComplete": "true"
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

This still needs a real workflow authoring model, optimistic versioning, and a proper instance command API for manual transitions. Also note that SQLite on AWS Lambda is ephemeral unless you mount persistent storage such as EFS, so this persistence layer is suitable for local development and simple deployments but not durable production state by itself.
