"""Small curated seed bank; generation is grounded on these patterns, not copied from them."""

BANK: dict[str, list[dict]] = {
    "frontend": [
        {"difficulty": "easy", "q": "Explain the difference between state and props in React."},
        {"difficulty": "medium", "q": "How would you diagnose and fix a slow-rendering list of 10k items?"},
        {"difficulty": "hard", "q": "Design a client-side caching and invalidation strategy for a data-heavy dashboard."},
    ],
    "backend": [
        {"difficulty": "easy", "q": "What is the difference between PUT and PATCH?"},
        {"difficulty": "medium", "q": "How do you make an endpoint idempotent, and why does it matter?"},
        {"difficulty": "hard", "q": "Design a rate limiter that works across multiple API instances."},
    ],
    "databases": [
        {"difficulty": "easy", "q": "What is an index and what does it cost you?"},
        {"difficulty": "medium", "q": "Explain transaction isolation levels and a bug each one prevents."},
        {"difficulty": "hard", "q": "How would you shard a large multi-tenant table?"},
    ],
    "system design": [
        {"difficulty": "medium", "q": "Design a URL shortener. What are the bottlenecks?"},
        {"difficulty": "hard", "q": "Design a real-time notification system for millions of users."},
    ],
    "behavioral": [
        {"difficulty": "easy", "q": "Tell me about a time you disagreed with a teammate."},
        {"difficulty": "medium", "q": "Describe a project that failed and what you changed afterward."},
    ],
}


def search(topic: str, difficulty: str | None = None, limit: int = 3) -> list[dict]:
    topic_l = topic.lower()
    hits: list[dict] = []
    for key, items in BANK.items():
        if key in topic_l or topic_l in key:
            hits.extend(items)
    if difficulty:
        hits = [h for h in hits if h["difficulty"] == difficulty.lower()] or hits
    return hits[:limit]
