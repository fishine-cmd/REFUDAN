# schoolmate/profile_builder.py
"""Profile builder — multi-source enrichment and provenance tracking.

Re-exported from the root profile_builder.py for the schoolmate package.
"""

from profile_builder import (
    ProfileBuilder,
    SignalSource,
    build_profile_from_xhs,
    merge_profiles,
)

__all__ = [
    "ProfileBuilder",
    "SignalSource",
    "build_profile_from_xhs",
    "merge_profiles",
]
