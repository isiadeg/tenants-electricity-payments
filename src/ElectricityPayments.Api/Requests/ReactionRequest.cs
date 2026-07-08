namespace ElectricityPayments.Api.Requests;

public sealed record ReactionRequest(string ReactionType, string? PreviousReactionType);
