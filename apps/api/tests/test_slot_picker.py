from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.services.slot_picker import next_free_slot


def test_picks_within_window():
    now = datetime(2026, 4, 24, 7, 0, tzinfo=ZoneInfo("Australia/Perth"))
    s = next_free_slot(now, "Australia/Perth", [0, 1, 2, 3, 4], 9, 17, taken=[])
    local = s.astimezone(ZoneInfo("Australia/Perth"))
    assert 9 <= local.hour < 17
    assert local.weekday() < 5


def test_skips_weekend():
    sat = datetime(2026, 4, 25, 10, 0, tzinfo=ZoneInfo("UTC"))
    s = next_free_slot(sat, "UTC", [0, 1, 2, 3, 4], 9, 17, taken=[])
    assert s.weekday() == 0  # Monday


def test_avoids_collisions():
    now = datetime(2026, 4, 27, 8, 0, tzinfo=ZoneInfo("UTC"))
    taken = [datetime(2026, 4, 27, 10, 0, tzinfo=ZoneInfo("UTC"))]
    s = next_free_slot(now, "UTC", [0, 1, 2, 3, 4], 9, 17, taken=taken, slot_minutes=20)
    assert s != taken[0]
    assert abs((s - taken[0]).total_seconds()) > 20 * 60 - 1
