from gradio_client import Client
client = Client("VantaTree/MLCodeTagger")

result = client.predict(
	code_snippet="""
def login(user, password):
    if not user:
        raise ValueError("Invalid")
    return True 
""",
	api_name="/predict_tags",
)
print("#1#1::\n", result, "\n")

result = client.predict(
	code_snippet="""
def make_cache_key(repo_url, c1, c2):
    # Sort the commits inside the cache key so the same comparison reuses one DB entry.
    ordered_commits = sorted([c1, c2])
    raw = f"{repo_url}|{ordered_commits[0]}|{ordered_commits[1]}"
    return hashlib.sha1(raw.encode()).hexdigest()
""",
	api_name="/predict_tags",
)
print("#2#2::\n", result, "\n")

result = client.predict(
	text="""
def login(user, password):
    if not user:
        raise ValueError("Invalid")
    return True

def make_cache_key(repo_url, c1, c2):
    # Sort the commits inside the cache key so the same comparison reuses one DB entry.
    ordered_commits = sorted([c1, c2])
    raw = f"{repo_url}|{ordered_commits[0]}|{ordered_commits[1]}"
    return hashlib.sha1(raw.encode()).hexdigest()
""",
	api_name="/predict_batch",
)
print(result)