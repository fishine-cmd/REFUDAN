#!/usr/bin/env python3
# run_pipeline.py
"""RE:FUDAN Unified Multi-Platform Profile Extraction Pipeline (v2).

New capabilities over v1:
  - Identifier generalization: input any number of accounts from any platform
  - Auto-detection of platform type from identifier format
  - Parallel scraping of all accounts via ThreadPoolExecutor
  - Unified LLM API key (one key for all analysis)
  - Profile storage in SQLite database (no more scattered JSON files)
  - FAISS vector embeddings for local similarity matching
  - Incremental profile updates (add platforms later)
  - Second Me cloud sync as backup

Pipeline:
    User Input (any accounts) -> Dispatcher (auto-detect + parallel) ->
    ContentAnalyzer (LLM) -> ProfileSynthesizer ->
    EmbeddingGenerator -> Database (SQLite + FAISS) ->
    (optional) Second Me sync

Usage:
    # Single platform
    python run_pipeline.py --accounts 193190562

    # Multiple platforms, auto-detected
    python run_pipeline.py --accounts 193190562 --accounts https://github.com/myuser

    # With explicit platform hints
    python run_pipeline.py --accounts github:myuser --accounts linkedin:https://linkedin.com/in/name

    # With Second Me sync
    python run_pipeline.py --accounts 193190562 --second-me-token sm_token_xxx

    # Search existing profiles
    python run_pipeline.py --search "量化金融 Python"

    # List all profiles in database
    python run_pipeline.py --list

    # Database stats
    python run_pipeline.py --stats
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from schoolmate.config import get_api_key, ensure_dirs
from schoolmate.database import ProfileDatabase
from schoolmate.collectors.dispatcher import CollectorDispatcher
from schoolmate.agents.content_analyzer import ContentAnalyzer
from schoolmate.agents.profile_synthesizer import ProfileSynthesizer
from schoolmate.agents.embedding import EmbeddingGenerator
from llm_client import LLMClient


def _clean_optional_text(value: Any) -> str:
    return str(value or "").strip()


def _build_user_context(args: argparse.Namespace) -> dict[str, Any]:
    manual_profile = {
        "school": _clean_optional_text(getattr(args, "school", "")),
        "major": _clean_optional_text(getattr(args, "major", "")),
        "gpa": _clean_optional_text(getattr(args, "gpa", "")),
        "goal": _clean_optional_text(getattr(args, "goal", "")),
    }
    return {
        "manual_profile": manual_profile,
        "has_manual_profile": any(manual_profile.values()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="RE:FUDAN Unified Profile Extraction Pipeline v2",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Auto-detect: one XHS account
  python run_pipeline.py --accounts 193190562

  # Multi-platform, auto-detected
  python run_pipeline.py --accounts 193190562 --accounts https://github.com/torvalds

  # Explicit platform:identifier syntax
  python run_pipeline.py --accounts xiaohongshu:193190562 --accounts github:myuser

  # Full pipeline with Second Me sync
  python run_pipeline.py --accounts 193190562 --second-me-token sm_xxx

  # Search profiles by criteria
  python run_pipeline.py --search "量化金融 Python" --search-skills "Python" --search-industry "金融"

  # List / stats
  python run_pipeline.py --list
  python run_pipeline.py --stats
        """,
    )

    # ── Account inputs (generalized) ──
    parser.add_argument("--accounts", action="append", default=[],
                        help="Account identifier. Format: 'identifier' (auto-detect) "
                             "or 'platform:identifier' (explicit). Repeatable.")

    # ── Pipeline control ──
    parser.add_argument("--api-key", default=None,
                        help="Unified LLM API key (DeepSeek). Uses DEEPSEEK_API_KEY env var if omitted.")
    parser.add_argument("--no-scrape", action="store_true",
                        help="Skip CDP scraping (use with --raw-input)")
    parser.add_argument("--raw-input", default=None,
                        help="Skip collection; analyze existing raw JSON")
    parser.add_argument("--no-analyze", action="store_true",
                        help="Scrape only, skip LLM analysis")
    parser.add_argument("--max-workers", type=int, default=6,
                        help="Max parallel collectors (default: 6)")

    # ── Output / Database ──
    parser.add_argument("--db-path", default=None,
                        help="SQLite database path")
    parser.add_argument("--user-id", default=None,
                        help="User ID for database storage (auto-generated if omitted)")
    parser.add_argument("--display-name", default=None,
                        help="Display name hint")
    parser.add_argument("--school", default=None,
                        help="User-declared school. Treated as ground truth for profile synthesis.")
    parser.add_argument("--major", default=None,
                        help="User-declared major. Treated as ground truth for profile synthesis.")
    parser.add_argument("--gpa", default=None,
                        help="User-declared GPA. Treated as ground truth for profile synthesis.")
    parser.add_argument("--goal", default=None,
                        help="User-declared target goal. Treated as ground truth for profile synthesis.")

    # ── Second Me ──
    parser.add_argument("--second-me-token", default=None,
                        help="Second Me OAuth2 access token")
    parser.add_argument("--second-me-base-url", default=None,
                        help="Second Me API base URL")
    parser.add_argument("--no-sync", action="store_true",
                        help="Skip Second Me sync")

    # ── Search ──
    parser.add_argument("--search", default=None,
                        help="Full-text search query for profiles")
    parser.add_argument("--search-skills", action="append", default=[],
                        help="Filter by skills (repeatable)")
    parser.add_argument("--search-industry", default=None,
                        help="Filter by target industry")
    parser.add_argument("--search-grade", default=None,
                        help="Filter by grade level")
    parser.add_argument("--top-k", type=int, default=10,
                        help="Max search results")

    # ── List / Stats ──
    parser.add_argument("--list", action="store_true",
                        help="List all profiles in database")
    parser.add_argument("--stats", action="store_true",
                        help="Show database statistics")

    # ── API / JSON mode ──
    parser.add_argument("--json-output", action="store_true",
                        help="Output a single JSON object on stdout (progress goes to stderr). "
                             "Use for programmatic / API consumption.")
    parser.add_argument("--resume-user-id", default=None,
                        help="Resume pipeline for an existing DB user. Skips collection "
                             "(Stage 1), re-runs analysis (Stages 2-4) on stored notes.")
    parser.add_argument("--get-profile", default=None,
                        help="Retrieve a stored profile by user_id and print JSON.")

    # ── Browser login (one-shot, persists cookies for Playwright collectors) ──
    parser.add_argument("--xhs-login", action="store_true",
                        help="One-shot: launch the real Chrome/CDP Xiaohongshu login flow. "
                             "The script verifies homepage UI/cookie/login state first, "
                             "then later collections reuse that trusted browser profile.")

    args = parser.parse_args()
    ensure_dirs()
    user_context = _build_user_context(args)

    # ── XHS login one-shot mode ──
    if args.xhs_login:
        try:
            from xhs_login import main as xhs_login_main
            return xhs_login_main()
        except Exception as e:
            sys.stderr.write(f"[XHS Login] FAILED: {e}\n")
            if args.json_output:
                print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
            return 1

    def log(msg: str) -> None:
        if args.json_output:
            sys.stderr.write(msg + "\n")
            sys.stderr.flush()
        else:
            print(msg)

    # ── Database operations (no scraping needed) ──
    db = ProfileDatabase(db_path=args.db_path)

    if args.get_profile:
        return cmd_get_profile(db, args.get_profile, args.json_output)

    if args.stats:
        return cmd_stats(db, args.json_output)

    if args.list:
        return cmd_list(db, args.json_output)

    if args.search or args.search_skills or args.search_industry or args.search_grade:
        return cmd_search(db, args, args.json_output)

    # ── Resume existing profile: skip collection, re-run analysis ──
    if args.resume_user_id:
        stored = db.get_profile(args.resume_user_id)
        if not stored:
            log(f"[FAIL] User not found in database: {args.resume_user_id}")
            if args.json_output:
                print(json.dumps({"success": False, "error": f"User not found: {args.resume_user_id}"}, ensure_ascii=False))
            return 1
        log(f"[Resume] Loaded stored profile for user: {args.resume_user_id}")
        # Reconstruct raw_data from stored profile
        raw_data = {
            "platforms": stored.get("platforms_used", []),
            "notes": stored.get("sources", {}).get("cached_notes", stored.get("notes", [])),
            "resolved_profile": {
                "nickname": stored.get("basic_info", {}).get("display_name", args.resume_user_id),
                "bio": stored.get("basic_info", {}).get("bio", ""),
                "profile_url": stored.get("basic_info", {}).get("profile_url", ""),
            },
            "extraction_status": {"success": True, "partial": False, "warnings": []},
            "user_context": user_context,
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }
        # Skip Stage 1, jump to Stage 2
        log("[1/4] Collection: skipped (--resume-user-id)")
        # Fall through to analysis stages below
    elif not args.accounts and not args.raw_input:
        log("[FAIL] Provide --accounts or --raw-input (or use --list / --stats / --search)")
        if args.json_output:
            print(json.dumps({"success": False, "error": "No accounts or raw input provided"}, ensure_ascii=False))
        return 1
    else:
        args.resume_user_id = None  # Ensure we don't enter resume mode

    # ── Resolve API key ──
    api_key = args.api_key or get_api_key()
    log(f"[Config] Unified API key: {api_key[:12]}...{api_key[-4:]}")

    # ═══════════════════════════════════════════════════════════════════
    #  STAGE 1 — Collect (parallel multi-platform CDP)
    # ═══════════════════════════════════════════════════════════════════

    if args.resume_user_id:
        pass  # Already loaded raw_data above; skip collection
    elif args.raw_input:
        log(f"\n[1/4] Collection: loading existing data from {args.raw_input}")
        raw_path = Path(args.raw_input)
        if not raw_path.exists():
            log(f"  [FAIL] File not found: {args.raw_input}")
            return 1
        raw_data = json.loads(raw_path.read_text(encoding="utf-8"))
        raw_data["user_context"] = user_context
        log(f"  [OK] Loaded {len(raw_data.get('notes', []))} notes from "
              f"{raw_data.get('platforms', [])}")
    elif args.no_scrape:
        log("[1/4] Collection: skipped (--no-scrape)")
        return 0
    else:
        log(f"\n[1/4] Collection: dispatching {len(args.accounts)} account(s)...")

        # Parse accounts: "plat:ident" or "ident" (auto-detect)
        parsed_accounts = []
        for acct in args.accounts:
            if ":" in acct and not acct.startswith("http"):
                plat, ident = acct.split(":", 1)
                parsed_accounts.append({"platform": plat.strip(), "identifier": ident.strip()})
            else:
                parsed_accounts.append(acct)

        dispatcher = CollectorDispatcher(max_workers=args.max_workers)
        try:
            raw_data = dispatcher.dispatch(parsed_accounts, display_name_hint=args.display_name)
        except RuntimeError as e:
            if "CDP" in str(e) or "not connected" in str(e):
                log("\n  [FAIL] Chrome CDP is not available.")
                log("  Enable remote debugging in Chrome first: chrome://inspect/#remote-debugging")
                log("  Then run `python xhs_login.py` once to confirm homepage login before collection.")
                if args.json_output:
                    print(json.dumps({
                        "success": False,
                        "error": "Chrome CDP not connected",
                        "hint": "Enable Chrome remote debugging, confirm 127.0.0.1:9222 is running, and run python xhs_login.py once",
                    }, ensure_ascii=False))
                return 1
            raise

        raw_data["user_context"] = user_context
        status = raw_data.get("extraction_status", {})
        rp = raw_data.get("resolved_profile", {})
        platforms_used = raw_data.get("platforms", [])
        log(f"\n  [Summary] Display name: {rp.get('nickname', '(unknown)')}")
        log(f"  [Summary] Platforms: {platforms_used}")
        log(f"  [Summary] Succeeded: {raw_data.get('successful_platforms', 0)}/{len(parsed_accounts)}")
        log(f"  [Summary] Total notes: {len(raw_data.get('notes', []))}")
        for w in status.get("warnings", [])[:5]:
            log(f"  [WARN] {w}")
        if len(status.get("warnings", [])) > 5:
            log(f"  [WARN] ... and {len(status['warnings']) - 5} more warnings")

    # ═══════════════════════════════════════════════════════════════════
    #  STAGE 2 — Analyze (LLM ContentAnalyzer)
    # ═══════════════════════════════════════════════════════════════════

    if args.no_analyze:
        log(f"\n[2/4] Analysis: skipped (--no-analyze)")
        return 0

    note_count = len(raw_data.get("notes", []))
    log(f"\n[2/4] ContentAnalyzer: analyzing {note_count} notes via LLM...")

    if note_count == 0:
        log("  [WARN] No notes to analyze; generating empty signals.")
        signals = ContentAnalyzer._empty_result("No notes collected across platforms.")
    else:
        llm = LLMClient(api_key=api_key)
        analyzer = ContentAnalyzer(llm=llm)
        signals = analyzer.analyze(raw_data)

    topics_count = len(signals.get("topics", {}).get("topics", []))
    skills_count = len(signals.get("skills", {}).get("skills_inferred", []))
    log(f"  [OK] Topics found: {topics_count}")
    log(f"  [OK] Skills extracted: {skills_count}")
    llm_errors = [
        k for k in ["topics", "skills", "style", "audience", "commercial"]
        if "error" in signals.get(k, {})
    ]
    if llm_errors:
        log(f"  [WARN] LLM errors in: {llm_errors}")

    # ═══════════════════════════════════════════════════════════════════
    #  STAGE 3 — Synthesize (ProfileSynthesizer)
    # ═══════════════════════════════════════════════════════════════════

    log(f"\n[3/4] ProfileSynthesizer: building unified profile...")

    synthesizer = ProfileSynthesizer()
    profile = synthesizer.synthesize(raw_data, signals)

    log(f"  [OK] Confidence: {profile['confidence']}")
    log(f"  [OK] Content topics: {len(profile.get('content_topics', []))}")
    log(f"  [OK] Skills: {len(profile.get('inferred_signals', {}).get('skills_inferred', []))}")
    log(f"  [OK] Limitations: {len(profile.get('limitations', []))}")

    # ═══════════════════════════════════════════════════════════════════
    #  STAGE 4 — Embed + Store (Database)
    # ═══════════════════════════════════════════════════════════════════

    log(f"\n[4/4] Database: generating embedding and storing profile...")

    # Generate embedding
    embedder = EmbeddingGenerator(api_key=api_key)
    try:
        embedding_vector = embedder.generate(profile)
        log(f"  [OK] Embedding generated: dim={len(embedding_vector)}")
    except Exception as e:
        log(f"  [WARN] Embedding failed ({e}), storing profile without vector.")
        embedding_vector = None

    # Determine user_id
    user_id = args.user_id or args.resume_user_id or (args.accounts[0] if args.accounts else "unknown")
    # Sanitize user_id: remove URL parts
    if "://" in user_id:
        user_id = user_id.rsplit("/", 1)[-1]
    if ":" in user_id and not user_id.startswith("http"):
        user_id = user_id.split(":", 1)[-1]

    display_name = args.display_name or profile.get("basic_info", {}).get("display_name", user_id)
    platforms_used = profile.get("platforms_used", [])

    row_id = db.upsert_profile(
        user_id=user_id,
        display_name=display_name,
        profile=profile,
        platforms_used=platforms_used,
        embedding_vector=embedding_vector,
    )
    log(f"  [OK] Profile stored in database (row_id={row_id}, user_id={user_id})")

    # ═══════════════════════════════════════════════════════════════════
    #  Second Me Sync (optional cloud backup)
    # ═══════════════════════════════════════════════════════════════════

    sync_result = None
    if args.second_me_token and not args.no_sync:
        log(f"\n[Sync] Second Me: uploading profile...")
        from schoolmate.second_me import sync_profile_to_second_me
        sync_result = sync_profile_to_second_me(
            user_id=user_id,
            display_name=display_name,
            profile=profile,
            access_token=args.second_me_token,
            base_url=args.second_me_base_url,
            db=db,
        )
        if sync_result.get("success"):
            log(f"  [OK] Profile synced to Second Me.")
        else:
            log(f"  [WARN] Second Me sync failed: {sync_result.get('error', 'unknown')}")
    elif not args.second_me_token:
        log(f"\n[Sync] Second Me: skipped (no --second-me-token)")
    else:
        log(f"\n[Sync] Second Me: skipped (--no-sync)")

    # ── Final summary ──
    log(f"\n{'=' * 60}")
    log(f"  Pipeline complete")
    log(f"  User ID:   {user_id}")
    log(f"  Name:      {display_name}")
    log(f"  Platforms: {platforms_used}")
    log(f"  Notes:     {note_count}")
    log(f"  Topics:    {topics_count}")
    log(f"  Skills:    {skills_count}")
    log(f"  Confidence:{profile['confidence']}")
    stats_dict = db.stats()
    log(f"  DB profiles: {stats_dict['total_profiles']} (FAISS vectors: {stats_dict['faiss_vectors']})")
    log(f"{'=' * 60}")

    # ── JSON output for API consumption ──
    if args.json_output:
        output = {
            "success": True,
            "user_id": user_id,
            "display_name": display_name,
            "platforms": platforms_used,
            "note_count": note_count,
            "topics_count": topics_count,
            "skills_count": skills_count,
            "confidence": profile["confidence"],
            "collection_status": raw_data.get("extraction_status", {}),
            "collection_diagnostics": raw_data.get("diagnostics", {}),
            "profile": profile,
        }
        if sync_result:
            output["second_me_sync"] = sync_result
        print(json.dumps(output, ensure_ascii=False))

    return 0


# ══════════════════════════════════════════════════════════════════════════
#  Command handlers
# ══════════════════════════════════════════════════════════════════════════

def cmd_get_profile(db: ProfileDatabase, user_id: str, json_output: bool = False) -> int:
    """Retrieve a stored profile and print as JSON."""
    profile = db.get_profile(user_id)
    if not profile:
        msg = f"Profile not found: {user_id}"
        if json_output:
            print(json.dumps({"success": False, "error": msg}, ensure_ascii=False))
        else:
            print(msg)
        return 1
    if json_output:
        print(json.dumps({"success": True, "user_id": user_id, "profile": profile}, ensure_ascii=False))
    else:
        print(json.dumps(profile, ensure_ascii=False, indent=2))
    return 0


def cmd_stats(db: ProfileDatabase, json_output: bool = False) -> int:
    stats = db.stats()
    if json_output:
        print(json.dumps({"success": True, "stats": stats}, ensure_ascii=False))
        return 0
    print("Database Statistics:")
    print(f"  Total profiles:  {stats['total_profiles']}")
    print(f"  Synced to Second Me: {stats['second_me_synced']}")
    print(f"  FAISS vectors:   {stats['faiss_vectors']}")
    print(f"  DB path:         {stats['db_path']}")
    print(f"  FAISS path:      {stats['faiss_path']}")
    return 0


def cmd_list(db: ProfileDatabase, json_output: bool = False) -> int:
    profiles = db.list_profiles()
    if json_output:
        print(json.dumps({"success": True, "profiles": profiles, "count": len(profiles)}, ensure_ascii=False))
        return 0
    if not profiles:
        print("No profiles in database.")
        return 0
    print(f"{'User ID':<30} {'Name':<20} {'Platforms':<30} {'Conf':>6} {'Synced':>6}")
    print("-" * 100)
    for p in profiles:
        plats = ",".join(p.get("platforms_used", []))
        synced = "Y" if p.get("second_me_synced") else "N"
        print(f"{p['user_id']:<30} {p['display_name']:<20} {plats:<30} {p['confidence']:>6.2f} {synced:>6}")
    print(f"\n{len(profiles)} profile(s) total.")
    return 0


def cmd_search(db: ProfileDatabase, args: argparse.Namespace, json_output: bool = False) -> int:
    industry = args.search_industry
    skills = args.search_skills if args.search_skills else None
    grade = args.search_grade

    results: list[dict[str, Any]] = []

    if args.search:
        # Use vector search if FAISS is available
        from schoolmate.agents.embedding import EmbeddingGenerator
        embedder = EmbeddingGenerator()
        try:
            query_vec = embedder._embed_fallback(args.search)
            vec_results = db.search_similar(query_vec, top_k=args.top_k)
            if vec_results:
                results = vec_results
        except Exception as e:
            if not json_output:
                print(f"[WARN] Vector search failed: {e}")

    # Fall back to rule-based if vector search returned nothing
    if not results:
        criteria_results = db.search_by_criteria(
            industry=industry,
            skills=skills,
            grade=grade,
            limit=args.top_k,
        )
        results = criteria_results

    if json_output:
        print(json.dumps({
            "success": True,
            "query": args.search,
            "filters": {"industry": industry, "skills": skills, "grade": grade},
            "results": results,
            "count": len(results),
        }, ensure_ascii=False))
        return 0

    if not results:
        print("No matching profiles found.")
        return 0

    print(f"Search results ({len(results)} found):")
    print(f"{'Score':>8} {'User ID':<25} {'Name':<20} {'Skills'}")
    print("-" * 80)
    for r in results:
        skills_list = r.get("profile", {}).get("inferred_signals", {}).get("skills_inferred", [])
        skills_str = ", ".join(skills_list[:5])
        print(f"{r.get('score', 0):>8.3f} {r.get('user_id', ''):<25} {r.get('display_name', ''):<20} {skills_str}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
