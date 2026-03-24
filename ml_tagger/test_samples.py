# ml_tagger/test_samples.py

from predict import predict_with_scores

samples = [
    # loops
    """
for i in range(10):
    print(i)
    """,

    # class + state
    """
class User:
    def __init__(self):
        self.name = "test"
    """,

    # error handling
    """
try:
    x = int("abc")
except ValueError:
    pass
    """,

    # async
    """
async def fetch():
    await api_call()
    """,

    # nested logic
    """
def process(x):
    if x > 10:
        for i in range(x):
            print(i)
    """,
]

for i, code in enumerate(samples):
    print(f"\n=== SAMPLE {i+1} ===")
    print(predict_with_scores(code))
    


print(f"\n=== SAMPLE app.py ===")
with open("app.py") as f:
    code = f.read()

print(predict_with_scores(code[:500]))  # chunk it