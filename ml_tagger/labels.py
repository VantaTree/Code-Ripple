from collections import Counter


TAG_DEFINITIONS = [
    {
        "label": "AUTHENTICATION",
        "keywords": [
            "auth", "authenticate", "authentication", "login", "logout",
            "password", "passwd", "username", "user_name", "token",
            "access token", "refresh token", "secret", "credential",
            "credentials", "oauth", "jwt", "session",
        ],
    },
    {
        "label": "AUTHORIZATION",
        "keywords": [
            "authorize", "authorization", "permission", "permissions", "role",
            "roles", "policy", "policies", "access control", "forbidden",
            "allowed", "acl", "rbac", "scope", "scopes",
        ],
    },
    {
        "label": "HTTP_API",
        "keywords": [
            "http", "https", "request", "response", "endpoint", "api",
            "rest", "graphql", "webhook", "url", "uri", "route", "routing",
            "client", "server", "headers", "status code", "status_code",
            "get", "post", "put", "patch", "delete",
        ],
    },
    {
        "label": "NETWORKING",
        "keywords": [
            "socket", "tcp", "udp", "dns", "host", "port", "connection",
            "connect", "disconnect", "packet", "proxy", "ssl", "tls",
            "websocket", "stream", "retry", "timeout",
        ],
    },
    {
        "label": "DATABASE",
        "keywords": [
            "database", "db", "sql", "sqlite", "postgres", "postgresql",
            "mysql", "mongodb", "redis", "query", "queries", "table",
            "tables", "row", "rows", "column", "columns", "insert", "update",
            "delete from", "select", "cursor", "transaction", "orm",
            "migration", "schema",
        ],
    },
    {
        "label": "FILE_IO",
        "keywords": [
            "file", "files", "open", "read", "write", "load", "save",
            "append", "buffer", "stream", "reader", "writer", "flush",
            "download", "upload", "archive", "zip", "tar",
        ],
    },
    {
        "label": "PATHS_FILESYSTEM",
        "keywords": [
            "path", "paths", "filepath", "filename", "dirname", "directory",
            "directories", "folder", "filesystem", "os.path", "pathlib",
            "exists", "mkdir", "rmdir", "glob", "walk",
        ],
    },
    {
        "label": "SERIALIZATION",
        "keywords": [
            "json", "yaml", "yml", "xml", "csv", "serialize", "serialized",
            "serialization", "deserialize", "deserialization", "pickle",
            "marshal", "dump", "dumps", "load", "loads", "parse",
            "encoding", "decoding",
        ],
    },
    {
        "label": "CONFIGURATION",
        "keywords": [
            "config", "configuration", "settings", "option", "options",
            "parameter", "parameters", "env", "environment", "dotenv",
            "ini", "toml", "yaml config", "defaults",
        ],
    },
    {
        "label": "LOGGING",
        "keywords": [
            "log", "logs", "logger", "logging", "debug", "info", "warning",
            "warn", "error log", "exception log", "audit",
        ],
    },
    {
        "label": "ERROR_HANDLING",
        "keywords": [
            "error", "errors", "exception", "exceptions", "raise", "raises",
            "try", "except", "finally", "failure", "fallback", "recover",
            "recovery", "traceback",
        ],
    },
    {
        "label": "VALIDATION",
        "keywords": [
            "validate", "validation", "validator", "check", "verify",
            "verified", "invalid", "valid", "sanitize", "sanitization",
            "schema validation", "constraint", "constraints", "guard",
        ],
    },
    {
        "label": "TEXT_PROCESSING",
        "keywords": [
            "text", "string", "strings", "split", "join", "replace", "strip",
            "format", "template", "tokenize", "tokenizer", "regex",
            "regexp", "pattern", "substring", "parse text", "normalize",
        ],
    },
    {
        "label": "SEARCH_FILTERING",
        "keywords": [
            "search", "find", "lookup", "match", "filter", "grep", "query",
            "contains", "startswith", "endswith", "select", "where",
            "predicate",
        ],
    },
    {
        "label": "SORTING_ORDERING",
        "keywords": [
            "sort", "sorted", "ordering", "order", "rank", "ranking",
            "priority", "heap", "topk", "top k",
        ],
    },
    {
        "label": "DATA_TRANSFORMATION",
        "keywords": [
            "transform", "transformation", "convert", "conversion", "map",
            "mapped", "normalize", "reshape", "flatten", "merge", "group",
            "aggregate", "reduce", "pipeline",
        ],
    },
    {
        "label": "NUMERICAL_COMPUTATION",
        "keywords": [
            "calculate", "calculation", "compute", "computation", "math",
            "matrix", "vector", "array", "ndarray", "numpy", "equation",
            "formula", "distance", "score", "probability", "statistics",
        ],
    },
    {
        "label": "DATE_TIME",
        "keywords": [
            "date", "time", "datetime", "timestamp", "timezone", "utc",
            "schedule", "cron", "calendar", "duration", "interval", "delay",
        ],
    },
    {
        "label": "ASYNC_CONCURRENCY",
        "keywords": [
            "async", "await", "asynchronous", "concurrent", "concurrency",
            "parallel", "thread", "threads", "process pool", "worker",
            "queue", "futures", "task", "tasks", "background job",
        ],
    },
    {
        "label": "CLI_ARGUMENTS",
        "keywords": [
            "cli", "command line", "command-line", "argparse", "click",
            "typer", "argv", "stdin", "stdout", "stderr", "subcommand",
            "flag", "flags", "option parser",
        ],
    },
    {
        "label": "SUBPROCESS_SYSTEM",
        "keywords": [
            "subprocess", "shell", "command", "commands", "process", "pid",
            "signal", "daemon", "system call", "exec", "spawn",
        ],
    },
    {
        "label": "TESTING",
        "keywords": [
            "test", "tests", "testing", "pytest", "unittest", "fixture",
            "mock", "assert", "assertion", "coverage", "benchmark",
        ],
    },
    {
        "label": "MACHINE_LEARNING",
        "keywords": [
            "model", "train", "training", "inference", "predict", "prediction",
            "classifier", "regression", "feature", "features", "embedding",
            "label", "labels", "dataset", "batch", "epoch", "loss",
            "accuracy", "transformer", "torch", "sklearn",
        ],
    },
    {
        "label": "WEB_HTML_PARSING",
        "keywords": [
            "html", "xml parser", "beautifulsoup", "scrape", "scraper",
            "crawl", "crawler", "dom", "markup", "page", "browser",
        ],
    },
    {
        "label": "IMAGE_PROCESSING",
        "keywords": [
            "image", "images", "pixel", "pixels", "resize", "crop", "rotate",
            "rgba", "rgb", "opencv", "pillow", "cv2", "mask", "bounding box",
        ],
    },
    {
        "label": "MESSAGING_EVENTS",
        "keywords": [
            "message", "messages", "event", "events", "publish", "subscribe",
            "pubsub", "kafka", "rabbitmq", "queue", "consumer", "producer",
            "notification",
        ],
    },
    {
        "label": "CACHING",
        "keywords": [
            "cache", "cached", "memoize", "memoization", "ttl", "evict",
            "eviction", "lru", "redis cache",
        ],
    },
]


LABELS = [definition["label"] for definition in TAG_DEFINITIONS]
TAG_KEYWORDS = {
    definition["label"]: list(definition["keywords"])
    for definition in TAG_DEFINITIONS
}


def validate_tag_definitions():
    labels = [definition["label"] for definition in TAG_DEFINITIONS]
    duplicates = [label for label, count in Counter(labels).items() if count > 1]
    if duplicates:
        raise ValueError(f"Duplicate labels found: {duplicates}")

    for definition in TAG_DEFINITIONS:
        keywords = definition["keywords"]
        if not keywords:
            raise ValueError(f"Label {definition['label']} has no keywords")
        if len(set(keywords)) != len(keywords):
            raise ValueError(f"Label {definition['label']} has duplicate keywords")


validate_tag_definitions()
