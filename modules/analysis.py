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

# ---------------- CONFIG ----------------

# REPO_NAME = "Pattern-Lock"
# REPO_PATH = "./tmp/repos/Pattern-Lock"
PREV_COMMIT = "86635c3bdeef6572e70f8d214a87222442b726c7"
NEW_COMMIT = "9d0badfa470071f81f0bad558c9fa0ff4ff040ba"
# PREV_COMMIT = "debf4f1e6faf03a8439438f7926e9f07a2eaa61a"
# NEW_COMMIT = "86635c3bdeef6572e70f8d214a87222442b726c7"

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
    

# ---------------- STEP 1: GET DIFF ----------------

def get_changed_python_files(repo):
    old = repo.commit(PREV_COMMIT)
    new = repo.commit(NEW_COMMIT)

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

def extract_changed_hunks(diff_text, context=3):
    """
    Extract human-readable diff hunks with limited context.
    """
    hunks = []
    current = []

    for line in diff_text.splitlines():
        if line.startswith("@@"):
            if current:
                hunks.append("\n".join(current))
                current = []
            current.append(line)
        elif current:
            current.append(line)

    if current:
        hunks.append("\n".join(current))

    return hunks

def collect_impacted_code(impact_map, analysis):
    """
    Collect source code only for impacted functions.
    """
    code = {}

    for root, data in impact_map.items():
        for direction in ("upstream", "downstream"):
            for item in data[direction]:
                node = item["function"]

                if "::GLOBAL::" in node:
                    continue

                file, fn_name = node.split("::")

                fn_meta = next(
                    f for f in analysis[file]["functions"]
                    if f["name"] == fn_name
                )

                source = get_function_source(
                    analysis[file]["source_code"],
                    fn_meta["start"],
                    fn_meta["end"]
                )

                code[node] = source

    return code

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

def print_human_readable_report(report):
    print("\n\n================ IMPACT ANALYSIS REPORT ================\n")

    print("🔴 SEVERITY RANKING\n")
    for item in report["summary"]:
        print(
            f"- {item['node']} | severity={item['severity']} "
            f"(↓ {item['downstream_count']} | ↑ {item['upstream_count']})"
        )

    print("\n🧠 DETAILED IMPACT PATHS\n")

    for entry in report["details"]:
        print(f"\nImpact Root: {entry['impact_root']}")

        if entry["upstream"]:
            print("  Upstream (callers):")
            for u in entry["upstream"]:
                print("   ", " -> ".join(u["path"]))
                if u["tags"]:
                    print("     Tags:", ", ".join(u["tags"]))

        if entry["downstream"]:
            print("  Downstream (callees):")
            for d in entry["downstream"]:
                print("   ", " -> ".join(d["path"]))
                if d["tags"]:
                    print("     Tags:", ", ".join(d["tags"]))


def build_llm_prompt(report, changed_hunks, impacted_code):
    """
    Deterministic, evidence-grounded LLM prompt.
    """

    p = []
    p.append("You are a senior software quality engineer.\n")
    p.append("Assess risk ONLY from provided evidence.\n")
    p.append("Do NOT guess or assume missing context.\n\n")

    # ---- DIFF ----
    p.append("=== CODE CHANGES (DIFF) ===\n")
    for h in changed_hunks:
        p.append(h + "\n\n")

    # ---- SEVERITY ----
    p.append("\n=== SEVERITY SUMMARY ===\n")
    for s in report["summary"]:
        p.append(
            f"- {s['node']} | severity={s['severity']} "
            f"(↓ {s['downstream_count']} ↑ {s['upstream_count']})\n"
        )

    # ---- IMPACT PATHS ----
    p.append("\n=== IMPACT PATHS ===\n")
    for d in report["details"]:
        p.append(f"\nImpact Root: {d['impact_root']}\n")

        for u in d["upstream"]:
            p.append("Upstream: " + " -> ".join(u["path"]) + "\n")
            if u["tags"]:
                p.append("Tags: " + ", ".join(u["tags"]) + "\n")

        for dn in d["downstream"]:
            p.append("Downstream: " + " -> ".join(dn["path"]) + "\n")
            if dn["tags"]:
                p.append("Tags: " + ", ".join(dn["tags"]) + "\n")

    # ---- CODE CONTEXT ----
    p.append("\n=== IMPACTED FUNCTION CODE ===\n")
    for node, src in impacted_code.items():
        p.append(f"\n--- {node} ---\n")
        p.append(src + "\n")

    p.append(
        "\nBased strictly on the above, generate:\n"
        "1. Risk assessment\n"
        "2. Failure modes\n"
        "3. Test recommendations\n"
    )

    return "".join(p)

# ---------------- MAIN RUN ----------------

def main():
    repo, REPO_PATH = get_or_clone_repo("https://github.com/vantatree/Pattern-Lock.git")
    safe_checkout(repo, NEW_COMMIT)
    changed_files = get_changed_python_files(repo)

    analysis = {}

    for entry in changed_files:
        
        try:
                
            file_path = os.path.join(REPO_PATH, entry["file"])
            # if not entry["file"].endswith(".py"):
            #     continue
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
                "assignments": parsed["assignments"],
                "usage": usage,
                "changed_lines": sorted(changed_lines),
                "impacted": impacted
            }
        except Exception as e:
            print(f"Skipping {entry['file']}: {e}")
            continue

    function_graph = build_function_graph(analysis)
        

    for file, data in analysis.items():
        
        import json
        json.dump(data, open("data.json", "w"), indent=4)
        
        source = data["source_code"]

        globals_defined, globals_used = extract_globals_and_usage(source)

        add_global_function_edges(
            function_graph,
            file,
            globals_defined,
            globals_used
        )
        
        print("\nFILE:", file)
        print("Changed lines:", data["changed_lines"])
        print("Impacted functions:", *[f["name"] for f in data["impacted"]["functions"]], sep="\n", end="\n\n")
        print("Impacted classes:", *[c["name"] for c in data["impacted"]["classes"]], sep="\n", end="\n\n")
        print("Calls:", *data["usage"]["calls"], sep="\n", end="\n\n")
        print("Reads:", *data["usage"]["reads"], sep="\n", end="\n\n")
        print("Writes:", *data["usage"]["writes"], sep="\n", end="\n\n")


    print("\n--- FUNCTION DEPENDENCY GRAPH ---")
    print("Total functions:", function_graph.number_of_nodes())
    print("Total call edges:", function_graph.number_of_edges())
    
    for src, dst, meta in function_graph.edges(data=True):
        print(f"{src} -> {dst} [{meta['type']}]")
        
    changed_functions = get_changed_function_nodes(analysis)
    changed_globals = get_changed_global_nodes(analysis)

    impact_roots = changed_functions | changed_globals

    impact_map = expand_impact(
        function_graph,
        impact_roots,
        max_depth=2
    )
    
    attach_semantics(impact_map, analysis)
    
    ranked_impacts = rank_impact_severity(impact_map, function_graph)

    print("\n--- GLOBAL → FUNCTION EDGES ---")
    for u, v, d in function_graph.edges(data=True):
        if d["type"] == "GLOBAL_USED_BY":
            print(f"{u} -> {v}")

    print("\n--- IMPACT EXPANSION ---")
    for changed, data in impact_map.items():
        print(f"\nChanged Function: {changed}")

        print("  Upstream (callers):")
        for u in data["upstream"]:
            print("   ", " -> ".join(u["path"]))

        print("  Downstream (callees):")
        for d in data["downstream"]:
            print("   ", " -> ".join(d["path"]))
            
    print("\n--- SEMANTIC IMPACT REPORT ---")
    for root, data in impact_map.items():
        print(f"\nImpact Root: {root}")

        for d in data["downstream"]:
            print(" ↓", d["function"])
            print("   Tags:", ", ".join(d["tags"]))
            

    print("\n--- IMPACT SEVERITY RANKING ---")
    for r in ranked_impacts:
        print(
            f"{r['node']} | severity={r['severity']} "
            f"(down={r['downstream']}, up={r['upstream']})"
        )

    changed_hunks = []
    for entry in changed_files:
        changed_hunks.extend(extract_changed_hunks(entry["patch"]))

    impacted_code = collect_impacted_code(impact_map, analysis)


    print("\n\n\n\n--- Report PREVIEW ---\n")
    report = build_impact_report(impact_map, ranked_impacts)
    print_human_readable_report(report)


    print("\n\n\n\n--- LLM PROMPT PREVIEW ---\n")
    llm_prompt = build_llm_prompt(report, changed_hunks, impacted_code)
    print(llm_prompt)


if __name__ == "__main__":
    main()
