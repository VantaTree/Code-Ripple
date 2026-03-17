from flask import Flask, render_template, request, jsonify
import requests
import os
from dotenv import load_dotenv

load_dotenv()
PORT = os.getenv("PORT") or 5000

app = Flask(__name__)

def extract_repo_info(url):
    # Example: https://github.com/user/repo
    parts = url.rstrip("/").split("/")
    return parts[-2], parts[-1]

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/commits", methods=["POST"])
def get_commits():
    data = request.json
    repo_url = data.get("repo_url")

    try:
        owner, repo = extract_repo_info(repo_url)
        api_url = f"https://api.github.com/repos/{owner}/{repo}/commits"

        response = requests.get(api_url)
        commits = response.json()

        result = []
        for c in commits[:10]:  # limit to 10
            commit_data = c["commit"]

            author = commit_data.get("author") or {}
            date = author.get("date")

            result.append({
                "sha": c["sha"],
                "message": commit_data.get("message"),
                "author": author.get("name", "Unknown"),
                "date": date
            })

        return jsonify({"commits": result})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/compare", methods=["POST"])
def compare():
    data = request.json

    repo_url = data.get("repo_url")
    commit1 = data.get("commit1")
    commit2 = data.get("commit2")

    # 🔥 This is where YOUR prototype will plug in later
    print("Compare:", repo_url, commit1, commit2)

    return jsonify({
        "status": "ok",
        "repo": repo_url,
        "commit1": commit1,
        "commit2": commit2
    })


if __name__ == "__main__":
    app.run("0.0.0.0", PORT)
    