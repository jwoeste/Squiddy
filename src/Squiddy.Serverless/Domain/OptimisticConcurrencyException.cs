namespace Squiddy.Serverless;

public sealed class OptimisticConcurrencyException : Exception
{
    public OptimisticConcurrencyException(string message)
        : base(message)
    {
    }
}
