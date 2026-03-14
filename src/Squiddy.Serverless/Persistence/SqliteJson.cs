using System.Text.Json;

namespace Squiddy.Serverless.Persistence;

public static class SqliteJson
{
    public static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public static string Serialize<T>(T value) =>
        JsonSerializer.Serialize(value, SerializerOptions);

    public static T Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, SerializerOptions)
        ?? throw new InvalidOperationException($"Could not deserialize JSON into {typeof(T).Name}.");
}
