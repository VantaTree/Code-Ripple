from git import Repo
import ast
import os
from pathlib import Path
import networkx as nx
import tempfile
import shutil
import hashlib
from dotenv import load_dotenv

load_dotenv()

def get_repo_dir(repo_url):
    
    repo_url = repo_url.strip()

    if repo_url.endswith("/"):
        repo_url = repo_url[:-1]

    if not repo_url.endswith(".git"):
        repo_url += ".git"
    
    hash_name = hashlib.sha1(repo_url.encode()).hexdigest()
    return f"tmp/repos/{hash_name}"

def get_or_clone_repo(repo_url):
    repo_path = get_repo_dir(repo_url)

    if os.path.exists(repo_path):
        repo = Repo(repo_path)

        try:
            repo.remotes.origin.fetch()
        except Exception:
            pass  # avoid crashing

        return repo, repo_path

    repo = Repo.clone_from(repo_url, repo_path, depth=50)
    return repo, repo_path

def safe_checkout(repo, commit):
    try:
        repo.git.rev_parse(commit)  # validate commit exists
    except Exception:
        raise ValueError(f"Invalid commit: {commit}")

    repo.git.reset("--hard")
    repo.git.clean("-fd")
    repo.git.checkout(commit)

def order_commits(repo_url, c1, c2):
    repo, path = get_or_clone_repo(repo_url)

    try:
        commit1 = repo.commit(c1)
        commit2 = repo.commit(c2)

        if commit1.committed_date < commit2.committed_date:
            return c1, c2
        else:
            return c2, c1

    finally:
        pass  # do not delete cached repo
    
def normalize_repo_url(repo_url):
    if not repo_url or not isinstance(repo_url, str):
        raise ValueError("Invalid repository URL")

    repo_url = repo_url.strip()

    # Remove trailing slash
    if repo_url.endswith("/"):
        repo_url = repo_url[:-1]

    # Convert github.com/... → https://github.com/...
    if repo_url.startswith("github.com"):
        repo_url = "https://" + repo_url

    # Ensure it's GitHub (optional but recommended for your project scope)
    if "github.com" not in repo_url:
        raise ValueError("Only GitHub repositories are supported")

    # Ensure .git suffix
    if not repo_url.endswith(".git"):
        repo_url += ".git"

    return repo_url

def prepare_working_copy(repo_url):
    base_repo, base_path = get_or_clone_repo(repo_url)

    # Create isolated temp working directory
    temp_dir = tempfile.mkdtemp(prefix="repo_", dir="tmp")

    try:
        shutil.copytree(base_path, temp_dir, dirs_exist_ok=True)
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError(f"Failed to prepare working copy: {e}")

    repo = Repo(temp_dir)

    return repo, temp_dir

def cleanup(path):
    if not path:
        return

    try:
        if os.path.exists(path):
            shutil.rmtree(path)
    except Exception as e:
        print(f"Cleanup failed for {path}: {e}")
    

# ---------------- STEP 1: GET DIFF ----------------

def get_changed_python_files(repo, prev_commit, new_commit):
    old = repo.commit(prev_commit)
    new = repo.commit(new_commit)

    diffs = old.diff(new, create_patch=True)
    result = []

    for d in diffs:
        if d.a_path and d.a_path.endswith(".py"):
            result.append({
                "file": d.a_path,
                "patch": d.diff.decode("utf-8", errors="ignore")
            })

    return result
    

# ---------------- STEP 2: AST PARSING ----------------

def parse_python_file(file_path):
    tree = ast.parse(Path(file_path).read_text(encoding="utf-8"))

    functions = []
    classes = []
    assignments = []

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            functions.append({
                "name": node.name,
                "start": node.lineno,
                "end": node.end_lineno,
                "args": [a.arg for a in node.args.args]
            })

        elif isinstance(node, ast.ClassDef):
            classes.append({
                "name": node.name,
                "start": node.lineno,
                "end": node.end_lineno
            })

        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    assignments.append({
                        "var": target.id,
                        "line": node.lineno
                    })

    return tree, {
        "functions": functions,
        "classes": classes,
        "assignments": assignments
    }
    
def extract_globals_and_usage(source):
    tree = ast.parse(source)

    globals_defined = set()
    globals_used_by_func = {}

    class Visitor(ast.NodeVisitor):
        def visit_Assign(self, node):
            if isinstance(node.parent, ast.Module):
                for t in node.targets:
                    if isinstance(t, ast.Name):
                        globals_defined.add(t.id)
            self.generic_visit(node)

        def visit_FunctionDef(self, node):
            used = set()

            class NameVisitor(ast.NodeVisitor):
                def visit_Name(self, n):
                    if isinstance(n.ctx, ast.Load):
                        used.add(n.id)

            NameVisitor().visit(node)
            globals_used_by_func[node.name] = used
            self.generic_visit(node)

    # attach parent refs
    for n in ast.walk(tree):
        for c in ast.iter_child_nodes(n):
            c.parent = n

    Visitor().visit(tree)
    return globals_defined, globals_used_by_func

# ---------------- STEP 3: CALLS + VAR USAGE ----------------

def extract_calls_and_vars(tree):
    calls, reads, writes = set(), set(), set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                calls.add(node.func.id)
            elif isinstance(node.func, ast.Attribute):
                calls.add(node.func.attr)

        elif isinstance(node, ast.Name):
            if isinstance(node.ctx, ast.Load):
                reads.add(node.id)
            elif isinstance(node.ctx, ast.Store):
                writes.add(node.id)

    return {
        "calls": sorted(calls),
        "reads": sorted(reads),
        "writes": sorted(writes)
    }

# ---------------- STEP 4: MAP DIFF → FUNCTIONS ----------------

def extract_changed_lines(diff_text):
    changed_lines = set()
    current_line = None

    for line in diff_text.splitlines():
        if line.startswith("@@"):
            part = line.split("+")[1]
            current_line = int(part.split(",")[0])
        elif line.startswith("+") and not line.startswith("+++"):
            changed_lines.add(current_line)
            current_line += 1
        elif not line.startswith("-"):
            if current_line:
                current_line += 1

    return changed_lines

def map_changed_globals(assignments, changed_lines):
    """
    Identify which global variables were modified
    based on diff line numbers.
    """
    impacted_globals = []

    for a in assignments:
        if a["line"] in changed_lines:
            impacted_globals.append(a["var"])

    return impacted_globals

def map_changes(parsed, changed_lines):
    impacted = {"functions": [], "classes": []}

    for fn in parsed["functions"]:
        if any(fn["start"] <= ln <= fn["end"] for ln in changed_lines):
            impacted["functions"].append(fn)

    for cls in parsed["classes"]:
        if any(cls["start"] <= ln <= cls["end"] for ln in changed_lines):
            impacted["classes"].append(cls)

    return impacted

# ---------------- STEP 5: Build Function‑Level Dependency Graph ----------------

def qualify(func_name, file_path):
    return f"{file_path}::{func_name}"

def build_function_graph(analysis):
    G = nx.DiGraph()

    # Index all functions by name per file
    function_index = {}

    for file, data in analysis.items():
        for fn in data["functions"]:
            qname = qualify(fn["name"], file)
            function_index.setdefault(fn["name"], []).append(qname)

            G.add_node(
                qname,
                file=file,
                start=fn["start"],
                end=fn["end"]
            )

    # Add call edges
    for file, data in analysis.items():
        callers = [
            qualify(fn["name"], file)
            for fn in data["functions"]
        ]

        for caller in callers:
            for callee_name in data["usage"]["calls"]:
                if callee_name in function_index:
                    for callee in function_index[callee_name]:
                        G.add_edge(
                            caller,
                            callee,
                            type="CALLS"
                        )

    return G


# ---------------- STEP 6: Build Function‑Level Dependency Graph ----------------
                    
def add_global_function_edges(graph, file, globals_defined, globals_used):
    for g in globals_defined:
        gnode = f"{file}::GLOBAL::{g}"
        graph.add_node(gnode, kind="GLOBAL")

        for fn, used in globals_used.items():
            if g in used:
                fnode = f"{file}::{fn}"
                if graph.has_node(fnode):
                    graph.add_edge(
                        gnode,
                        fnode,
                        type="GLOBAL_USED_BY"
                    )

def get_changed_function_nodes(analysis):
    changed_nodes = set()

    for file, data in analysis.items():
        for fn in data["impacted"]["functions"]:
            changed_nodes.add(f"{file}::{fn['name']}")

    return changed_nodes

def get_changed_global_nodes(analysis):
    roots = set()

    for file, data in analysis.items():
        for g in data["impacted"].get("globals", []):
            roots.add(f"{file}::GLOBAL::{g}")

    return roots

def expand_impact(graph, changed_nodes, max_depth=3):
    impact = {}

    for fn in changed_nodes:
        impact[fn] = {
            "upstream": [],
            "downstream": []
        }

        # Downstream (callees)
        for target in nx.descendants(graph, fn):
            path = nx.shortest_path(graph, fn, target)
            if len(path) - 1 <= max_depth:
                impact[fn]["downstream"].append({
                    "function": target,
                    "path": path
                })

        # Upstream (callers)
        for source in nx.ancestors(graph, fn):
            path = nx.shortest_path(graph, source, fn)
            if len(path) - 1 <= max_depth:
                impact[fn]["upstream"].append({
                    "function": source,
                    "path": path
                })

    return impact

# ---------------- STEP 7: Semantic Impact Tagging ----------------

def get_function_source(source_code, start, end):
    """
    Extract exact source code for a function
    using line numbers.
    """
    lines = source_code.splitlines()
    return "\n".join(lines[start - 1:end])

def semantic_tags_for_source(source):
    tags = set()

    if "set_timer" in source or "USEREVENT" in source:
        tags.add("TIMER")

    if "screen.blit" in source or "pygame.display" in source:
        tags.add("UI")

    if "self." in source:
        tags.add("STATE_MUTATION")

    if "pygame.event.get" in source:
        tags.add("EVENT_HANDLER")

    if "mixer.Sound" in source or ".play()" in source:
        tags.add("AUDIO")

    if "mouse.get_pos" in source or "mouse.get_pressed" in source:
        tags.add("USER_INPUT")

    return sorted(tags)


def attach_semantics(impact_map, analysis):
    for root, paths in impact_map.items():
        for direction in ("upstream", "downstream"):
            for item in paths[direction]:
                node = item["function"]

                # Global nodes
                if "::GLOBAL::" in node:
                    item["tags"] = ["GLOBAL_CONFIG"]
                    continue

                file, fn_name = node.split("::")

                # Find function metadata
                fn_meta = next(
                    f for f in analysis[file]["functions"]
                    if f["name"] == fn_name
                )

                fn_source = get_function_source(
                    analysis[file]["source_code"],
                    fn_meta["start"],
                    fn_meta["end"]
                )

                item["tags"] = semantic_tags_for_source(fn_source)

# ---------------- STEP 8A: Impact severity ranking (deterministic) ----------------

def classify_node(node):
    if "::GLOBAL::" in node:
        return "GLOBAL"
    return "FUNCTION"

def compute_severity(node, impact_data, graph):
    score = 0

    # 1. Origin
    kind = classify_node(node)
    if kind == "GLOBAL":
        score += 5
    else:
        score += 3

    # 2. Blast radius
    downstream = impact_data["downstream"]
    upstream = impact_data["upstream"]

    score += len(downstream) * 1
    score += len(upstream) * 0.5

    # 3. Depth weighting
    for entry in downstream + upstream:
        depth = len(entry["path"]) - 1
        if depth == 1:
            score += 2
        elif depth == 2:
            score += 1
        else:
            score += 0.5

    # 4. Structural hints
    if "::GLOBAL::" in node:
        score += 2

    if "__init__" in node:
        score += 1

    return round(score, 2)

def rank_impact_severity(impact_map, graph):
    ranked = []

    for node, data in impact_map.items():
        severity = compute_severity(node, data, graph)
        ranked.append({
            "node": node,
            "severity": severity,
            "downstream": len(data["downstream"]),
            "upstream": len(data["upstream"])
        })

    return sorted(ranked, key=lambda x: x["severity"], reverse=True)


# ---------------- STEP 8B: Structured Impact Report Generation ----------------

def build_impact_report(impact_map, ranked_impacts):
    """
    Convert impact analysis into a structured, LLM-ready report.
    No inference, no guessing — only facts derived from graph + semantics.
    """

    report = {
        "summary": [],
        "details": []
    }

    # High-level summary (ranked)
    for item in ranked_impacts:
        report["summary"].append({
            "node": item["node"],
            "severity": item["severity"],
            "upstream_count": item["upstream"],
            "downstream_count": item["downstream"]
        })

    # Detailed breakdown per impact root
    for root, data in impact_map.items():
        entry = {
            "impact_root": root,
            "upstream": [],
            "downstream": []
        }

        for u in data["upstream"]:
            entry["upstream"].append({
                "path": u["path"],
                "tags": u.get("tags", [])
            })

        for d in data["downstream"]:
            entry["downstream"].append({
                "path": d["path"],
                "tags": d.get("tags", [])
            })

        report["details"].append(entry)

    return report



# ------------------ Master Function -----------------------

def run_analysis(repo_url, commit1, commit2):
    repo_url = normalize_repo_url(repo_url)

    # Ensure correct ordering (OLDER → NEWER)
    prev_commit, new_commit = order_commits(repo_url, commit1, commit2)

    repo, repo_path = prepare_working_copy(repo_url)

    # try:
    safe_checkout(repo, new_commit)

    changed_files = get_changed_python_files(repo, prev_commit, new_commit)

    analysis = {}

    for entry in changed_files:
        try:
            file_path = os.path.join(repo_path, entry["file"])

            if not os.path.exists(file_path):
                continue

            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()

            tree, parsed = parse_python_file(file_path)
            usage = extract_calls_and_vars(tree)
            changed_lines = extract_changed_lines(entry["patch"])

            impacted = map_changes(parsed, changed_lines)
            impacted["globals"] = map_changed_globals(
                parsed["assignments"],
                changed_lines
            )

            analysis[entry["file"]] = {
                "source_code": source,
                "functions": parsed["functions"],
                "classes": parsed["classes"],
                "usage": usage,
                "changed_lines": sorted(changed_lines),
                "impacted": impacted
            }

        except Exception:
            continue

    # ---- GRAPH + IMPACT ----
    graph = build_function_graph(analysis)

    for file, data in analysis.items():
        globals_defined, globals_used = extract_globals_and_usage(
            open(os.path.join(repo_path, file)).read()
        )

        add_global_function_edges(
            graph,
            file,
            globals_defined,
            globals_used
        )

    changed_functions = get_changed_function_nodes(analysis)
    changed_globals = get_changed_global_nodes(analysis)

    impact_roots = changed_functions | changed_globals

    impact_map = expand_impact(graph, impact_roots, max_depth=2)

    attach_semantics(impact_map, analysis)

    ranked = rank_impact_severity(impact_map, graph)

    report = build_impact_report(impact_map, ranked)

    cleanup(repo_path)
    
    return {
        "report": report,
        "ranked": ranked
    }

    # finally:
    # cleanup(repo_path)