namespace Squiddy.Serverless.Persistence;

public sealed record WorkflowStorageDiagnostics(
    string Provider,
    string? Connection,
    string CurrentDirectory,
    IReadOnlyList<WorkflowStorageTableDiagnostics> Tables);

public sealed record WorkflowStorageTableDiagnostics(
    string Name,
    IReadOnlyList<string> Columns,
    int RowCount);
