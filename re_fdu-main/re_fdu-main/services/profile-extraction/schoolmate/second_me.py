# schoolmate/second_me.py
"""Second Me API integration for RE:FUDAN profile sync.

Handles one-click profile sync to Second Me cloud as backup and optional matching.
Keeps the existing SecondMeClient.update_profile() flow intact.
"""

from __future__ import annotations

from typing import Any

from profile_schema import Profile, SecondMeClient
from schoolmate.database import ProfileDatabase


def sync_profile_to_second_me(
    user_id: str,
    display_name: str,
    profile: dict[str, Any],
    access_token: str,
    base_url: str | None = None,
    db: ProfileDatabase | None = None,
) -> dict[str, Any]:
    """Convert a synthesizer profile dict to a Second Me Profile and sync.

    Also marks the profile as synced in the database.

    Args:
        user_id: The user's unique identifier
        display_name: Display name for the user
        profile: The unified profile dict from ProfileSynthesizer
        access_token: Second Me OAuth2 access token
        base_url: Second Me API base URL
        db: Optional ProfileDatabase to mark synced status

    Returns:
        {success: bool, data: dict|None, error: str|None}
    """
    try:
        from profile_builder import ProfileBuilder

        basic = profile.get("basic_info", {})
        inferred = profile.get("inferred_signals", {})
        style = profile.get("style_profile", {})

        builder = ProfileBuilder(user_id=user_id, name=display_name)

        # Fill skills
        skills_raw = inferred.get("skills_inferred", [])
        if skills_raw:
            builder.profile.skills = list(dict.fromkeys(skills_raw))

        # Fill interests from topics
        topics = profile.get("content_topics", [])
        interest_tags = [t["topic"] for t in topics if t.get("confidence", 0) >= 0.5]
        if interest_tags:
            builder.profile.interests = interest_tags

        # Career domains
        domains = inferred.get("career_domains", {})
        if domains:
            domain_labels = list(domains.keys())
            if domain_labels:
                builder.profile.target_industry = domain_labels[0]
                builder.profile.career_goal = f"探索方向: {' / '.join(domain_labels[:3])}"

        # Education
        edu = inferred.get("education", {})
        if edu:
            schools = edu.get("school", [])
            if schools:
                builder.profile.major = f"在校生 — {schools[0]}"
            grades = edu.get("grade_level", [])
            if grades:
                builder.profile.grade = grades[0]

        # Personality from tone
        tone = style.get("tone", [])
        if tone:
            builder.profile.personality_traits = tone

        # Social accounts from platform profiles
        platform_profiles = profile.get("platform_profiles", {})
        sa = builder.profile.social_accounts
        if isinstance(sa, dict):
            for plat, plat_data in platform_profiles.items():
                if plat == "xiaohongshu" and plat_data.get("xhs_id"):
                    sa["xiaohongshu"] = plat_data["xhs_id"]
                elif plat == "github" and plat_data.get("github_username"):
                    sa["github"] = plat_data["github_username"]
                elif plat == "linkedin" and plat_data.get("profile_url"):
                    sa["linkedin"] = plat_data["profile_url"]

        built_profile = builder.to_profile()

        # Call Second Me API
        client_kwargs = {"access_token": access_token}
        if base_url:
            client_kwargs["base_url"] = base_url
        client = SecondMeClient(**client_kwargs)
        resp = client.update_profile(built_profile)

        # Mark synced in DB
        if db:
            db.set_second_me_synced(user_id)

        return {"success": True, "data": resp, "error": None}

    except Exception as e:
        return {"success": False, "data": None, "error": str(e)}


def sync_missing_to_second_me(
    db: ProfileDatabase,
    access_token: str,
    base_url: str | None = None,
) -> dict[str, Any]:
    """Sync all unsynced profiles in the database to Second Me.

    Returns {total, synced, failed} stats.
    """
    profiles = db.list_profiles(limit=1000)
    unsynced = [p for p in profiles if not p.get("second_me_synced")]
    success_count = 0
    fail_count = 0

    for p in unsynced:
        full_profile = db.get_profile(p["user_id"])
        if not full_profile:
            continue
        result = sync_profile_to_second_me(
            user_id=p["user_id"],
            display_name=p["display_name"],
            profile=full_profile,
            access_token=access_token,
            base_url=base_url,
            db=db,
        )
        if result["success"]:
            success_count += 1
        else:
            fail_count += 1

    return {"total": len(unsynced), "synced": success_count, "failed": fail_count}
