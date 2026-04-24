from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


def next_free_slot(
    now: datetime,
    tz_name: str,
    weekdays: list[int],
    start_hour: int,
    end_hour: int,
    taken: list[datetime],
    slot_minutes: int = 20,
) -> datetime:
    tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    local_now = now.astimezone(tz)
    candidate = local_now + timedelta(hours=1)
    candidate = candidate.replace(minute=0, second=0, microsecond=0)
    taken_local = [t.astimezone(tz) for t in taken]
    for _ in range(24 * 14):  # up to 14 days ahead by hour
        if candidate.weekday() not in weekdays:
            candidate = (candidate + timedelta(days=1)).replace(hour=start_hour)
            continue
        if candidate.hour < start_hour:
            candidate = candidate.replace(hour=start_hour)
            continue
        if candidate.hour >= end_hour:
            candidate = (candidate + timedelta(days=1)).replace(hour=start_hour)
            continue
        collision = any(
            abs((t - candidate).total_seconds()) < slot_minutes * 60 for t in taken_local
        )
        if not collision:
            return candidate.astimezone(timezone.utc)
        candidate += timedelta(hours=1)
    return candidate.astimezone(timezone.utc)
