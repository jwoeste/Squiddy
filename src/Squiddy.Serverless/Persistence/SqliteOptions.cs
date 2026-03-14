namespace Squiddy.Serverless.Persistence;

public sealed class SqliteOptions
{
    public string DatabasePath { get; }

    public SqliteOptions()
    {
        DatabasePath = ResolveDatabasePath();
    }

    private static string ResolveDatabasePath()
    {
        var configuredPath = Environment.GetEnvironmentVariable("SQUIDDY_DB_PATH");
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            return configuredPath;
        }

        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AWS_LAMBDA_FUNCTION_NAME")))
        {
            return "/tmp/squiddy.db";
        }

        return Path.Combine(Directory.GetCurrentDirectory(), "data", "squiddy.db");
    }
}
