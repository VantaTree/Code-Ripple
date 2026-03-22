from flask import Flask, render_template, request, jsonify
import requests
import os
from dotenv import load_dotenv

from services.analyzer import run_analysis


load_dotenv()
PORT = os.getenv("PORT") or 5000

app = Flask(__name__)

def extract_repo_info(url):
    # Example: https://github.com/user/repo
    parts = url.rstrip("/").split("/")
    return parts[-2], parts[-1]

def fetch_recent_commits(repo_url, limit=20):
    # Shared helper so both the HTML page and JSON API use the same commit-fetching logic.
    owner, repo = extract_repo_info(repo_url)
    api_url = f"https://api.github.com/repos/{owner}/{repo}/commits"

    # Ask GitHub for exactly the number of commits we want to show on the results page.
    response = requests.get(api_url, params={"per_page": limit}, timeout=10)
    response.raise_for_status()
    commits = response.json()

    result = []
    for c in commits[:limit]:
        commit_data = c["commit"]
        author = commit_data.get("author") or {}

        result.append({
            "sha": c["sha"],
            "message": commit_data.get("message"),
            "author": author.get("name", "Unknown"),
            "date": author.get("date")
        })

    return result

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/commits", methods=["GET"])
def commits_page():
    repo_url = request.args.get("repo_url", "")
    commits = []
    error = None

    if repo_url:
        try:
            # Render the latest 20 commits on the server so the results page is fully Jinja-driven.
            commits = fetch_recent_commits(repo_url, limit=20)
        except Exception as e:
            error = str(e)

    return render_template("results.html", repo_url=repo_url, commits=commits, error=error)

@app.route("/commits", methods=["POST"])
def get_commits():
    data = request.json
    repo_url = data.get("repo_url")

    try:
        # Keep the JSON endpoint available for any future async workflow.
        return jsonify({"commits": fetch_recent_commits(repo_url, limit=20)})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/compare", methods=["POST"])
def compare():
    data = request.json

    repo_url = data.get("repo_url")
    commit1 = data.get("commit1")
    commit2 = data.get("commit2")

    if not repo_url or not commit1 or not commit2:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        result = run_analysis(repo_url, commit1, commit2)

        print(result)
        response = jsonify({
            "status": "ok",
            "data": result
        })
        return response

    except Exception as e:
        print(e)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


if __name__ == "__main__":
    app.run("0.0.0.0", PORT)
    
