from flask import Blueprint

repo_bp = Blueprint("repo", __name__)

@repo_bp.route("/compare", methods=['POST'])
def compare_commit():
    return {"message": ":("}, 201