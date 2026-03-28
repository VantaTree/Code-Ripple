from flask import Flask, render_template, request, jsonify, redirect, url_for
from db import analysis_collection, mongo_available, mongo_error
import hashlib
import requests
import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from services.analyzer import run_analysis, normalize_repo_url
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import threading


load_dotenv()
PORT = os.getenv("PORT") or 5000
DISABLE_ML_TAGGER = os.getenv("DISABLE_ML_TAGGER") == "1"

if not DISABLE_ML_TAGGER:
    try:
        from ml_tagger.predict_render import load_model
    except Exception as exc:
        load_model = None
        print(f"ML model import failed, continuing without ML tagging: {exc}")
    else:
        try:
            load_model()
        except Exception as exc:
            print(f"ML model load failed, continuing without ML tagging: {exc}")

app = Flask(__name__)

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["100 per hour"]
)

def run_analysis_background(cache_key, repo_url, commit1, commit2):
    result = run_analysis(repo_url, commit1, commit2)

    store_analysis_result(
        cache_key,
        repo_url,
        commit1,
        commit2,
        result
    )

def extract_repo_info(url):
    # Example: https://github.com/user/repo
    parts = url.rstrip("/").split("/")
    return parts[-2], parts[-1]

def fetch_recent_commits(repo_url, limit=20, page=1):
    # Shared helper so both the HTML page and JSON API use the same commit-fetching logic.
    owner, repo = extract_repo_info(repo_url)
    api_url = f"https://api.github.com/repos/{owner}/{repo}/commits"

    # Ask GitHub for exactly the number of commits we want to show on the results page.
    response = requests.get(
        api_url,
        params={"per_page": limit, "page": page},
        timeout=10
    )
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

    return {
        "commits": result,
        "page": page,
        "per_page": limit,
        "has_more": len(commits) == limit
    }

def make_cache_key(repo_url, c1, c2):
    # Sort the commits inside the cache key so the same comparison reuses one DB entry.
    ordered_commits = sorted([c1, c2])
    raw = f"{repo_url}|{ordered_commits[0]}|{ordered_commits[1]}"
    return hashlib.sha1(raw.encode()).hexdigest()

def get_cached_analysis(cache_key):
    # Reuse stored analysis results so repeated comparisons do not rerun the analyzer.
    if not mongo_available or analysis_collection is None:
        return None
    return analysis_collection.find_one({"cache_key": cache_key})

def store_analysis_result(cache_key, repo_url, commit1, commit2, result):
    # Upsert keeps the cache fresh without creating duplicate analysis documents.
    if not mongo_available or analysis_collection is None:
        return False

    result = analysis_collection.update_one(
        {"cache_key": cache_key},
        {
            "$set": {
                "cache_key": cache_key,
                "repo_url": repo_url,
                "commit1": commit1,
                "commit2": commit2,
                "result": result,
                "updated_at": datetime.now(timezone.utc)
            },
            "$setOnInsert": {
                "created_at": datetime.now(timezone.utc)
            }
        },
        upsert=True
    )
    return result.acknowledged

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
            commit_data = fetch_recent_commits(repo_url, limit=20, page=1)
            commits = commit_data["commits"]
        except Exception as e:
            error = str(e)
            commit_data = {"has_more": False}
    else:
        commit_data = {"has_more": False}

    return render_template(
        "results.html",
        repo_url=repo_url,
        commits=commits,
        error=error,
        has_more_commits=commit_data["has_more"]
    )

@app.route("/commits", methods=["POST"])
@limiter.limit("20 per minute")
def get_commits():
    data = request.json
    repo_url = data.get("repo_url")
    page = data.get("page", 1)
    per_page = data.get("per_page", 20)

    try:
        # Keep the JSON endpoint available for any future async workflow.
        page = max(1, int(page))
        per_page = max(1, min(int(per_page), 100))

        return jsonify(fetch_recent_commits(repo_url, limit=per_page, page=page))

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
        
@app.route("/compare", methods=["POST"])
@limiter.limit("10 per minute")
def compare():
    data = request.json

    repo_url = data.get("repo_url")
    commit1 = data.get("commit1")
    commit2 = data.get("commit2")

    if not repo_url or not commit1 or not commit2:
        return jsonify({"error": "Missing required fields"}), 400
    
    if len(repo_url) > 200:
        return jsonify({"error": "Invalid repo URL"}), 400

    normalized_repo_url = normalize_repo_url(repo_url)
    cache_key = make_cache_key(normalized_repo_url, commit1, commit2)

    cached_analysis = get_cached_analysis(cache_key)

    # 🔥 IF NOT CACHED → RUN IN BACKGROUND
    if not cached_analysis:
        thread = threading.Thread(
            target=run_analysis_background,
            args=(cache_key, normalized_repo_url, commit1, commit2),
            daemon=True
        )
        thread.start()

    return jsonify({
        "status": "ok",
        "redirect_url": url_for("analysis_loading_page", cache_key=cache_key)
    })

@app.route("/analysis")
def analysis_root():
    # Keep this route friendly if someone navigates to /analysis directly.
    return redirect(url_for("index"))

@app.route("/analysis/<cache_key>")
def analysis_page(cache_key):
    cached_analysis = get_cached_analysis(cache_key)
    cache_status = request.args.get("cache_status", "unknown")

    if not cached_analysis:
        return render_template(
            "analysis.html",
            error="No cached analysis found for this comparison. MongoDB may be unavailable." if not mongo_available else "No cached analysis found for this comparison.",
            analysis_data=None,
            summary=[],
            chunks=[],
            ai_summary={},
            meta={},
            repo_url="",
            commit1="",
            commit2="",
            cache_key=cache_key,
            cache_source="Unavailable",
            mongo_error=mongo_error,
            mongo_available=mongo_available,
            cache_status=cache_status
        ), 404

    result = cached_analysis.get("result", {})

    # -------- SAFE EXTRACTION --------
    meta = result.get("meta", {})
    summary = result.get("summary", [])
    chunks = result.get("chunks", [])
    ai_summary = result.get("ai_summary", {})

    return render_template(
        "analysis.html",
        error=None,

        # 🔥 CORE DATA
        analysis_data=result,
        meta=meta,
        summary=summary,
        chunks=chunks,
        ai_summary=ai_summary,

        # 🔥 COMPAT (remove later if needed)
        details=[],  # legacy, avoid template crash

        # 🔥 METADATA
        repo_url=cached_analysis.get("repo_url", ""),
        commit1=cached_analysis.get("commit1", ""),
        commit2=cached_analysis.get("commit2", ""),
        cached_at=cached_analysis.get("updated_at"),
        cache_key=cached_analysis.get("cache_key", ""),

        cache_source="MongoDB" if mongo_available else "Unavailable",
        mongo_error=mongo_error,
        mongo_available=mongo_available,
        cache_status=cache_status
    )
    
@app.route("/api/analysis/<cache_key>", methods=["GET"])
@limiter.limit("360 per minute")
def get_analysis_api(cache_key):
    cached_analysis = get_cached_analysis(cache_key)

    if not cached_analysis:
        return jsonify({"status": "processing"}), 202  # 🔥 important

    return jsonify({
        "status": "ready",
        "meta": cached_analysis["result"].get("meta", {}),
        "summary": cached_analysis["result"].get("summary", []),
        "chunks": cached_analysis["result"].get("chunks", []),
        "ai_summary": cached_analysis["result"].get("ai_summary", {})
    })

@app.route("/analysis_loading/<cache_key>")
def analysis_loading_page(cache_key):
    return render_template("analysis_loading.html", cache_key=cache_key)

if __name__ == "__main__":
    app.run("0.0.0.0", PORT)
    
