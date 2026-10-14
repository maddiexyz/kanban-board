import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.board import Card

ALPHABET = "abcdefghijklmnopqrstuvwxyz"
DEFAULT_INITIAL_RANK = "0|100000:"
MAX_RANK_LENGTH = 32


class RankSpaceExhausted(ValueError):
    """Raised when integer bucket or string rank space is exhausted and rebalancing is required."""
    pass


def between(prev_rank: Optional[str] = None, next_rank: Optional[str] = None) -> str:
    """
    Compute a Lexorank string strictly between prev_rank and next_rank:
    prev_rank < between(prev_rank, next_rank) < next_rank.

    Cases:
    - Inserting between None and None: returns default initial rank.
    - Inserting between "aaaa" and "aaac": returns "aaab".
    - Inserting between adjacent characters with no gap (e.g. "a" and "b"): returns "an".
    - Inserting between Jira/bucket formatted ranks ("0|100000:", "0|200000:"): returns "0|150000:".
    """
    # 1. Both None: empty column initial rank
    if prev_rank is None and next_rank is None:
        return DEFAULT_INITIAL_RANK

    # 2. Before next_rank (insert at head)
    if prev_rank is None:
        if not next_rank:
            return DEFAULT_INITIAL_RANK
        # Handle bucket formatted ranks
        if "|" in next_rank:
            bucket, r = next_rank.split("|", 1)
            r_clean = r.rstrip(":")
            if r_clean.isdigit():
                val = int(r_clean)
                if val > 1:
                    return f"{bucket}|{val // 2:06d}:"
                else:
                    raise RankSpaceExhausted(f"Rank space exhausted before '{next_rank}'")
            return f"{bucket}|{between(None, r_clean)}:"
        
        idx = ALPHABET.index(next_rank[0]) if next_rank[0] in ALPHABET else 12
        if idx > 1:
            return ALPHABET[idx // 2]
        elif idx == 1:
            return "an"
        else:
            if len(next_rank) > 1:
                return "a" + between(None, next_rank[1:])
            return "an"

    # 3. After prev_rank (insert at tail)
    if next_rank is None:
        if not prev_rank:
            return DEFAULT_INITIAL_RANK
        # Handle bucket formatted ranks
        if "|" in prev_rank:
            bucket, r = prev_rank.split("|", 1)
            r_clean = r.rstrip(":")
            if r_clean.isdigit():
                val = int(r_clean)
                if val <= 800000:
                    return f"{bucket}|{val + 100000:06d}:"
                elif val < 999900:
                    step = max(1, (999999 - val) // 2)
                    return f"{bucket}|{val + step:06d}:"
                else:
                    raise RankSpaceExhausted(f"Rank space exhausted after '{prev_rank}'")
            return f"{bucket}|{between(r_clean, None)}:"

        idx = ALPHABET.index(prev_rank[0]) if prev_rank[0] in ALPHABET else 12
        if idx < len(ALPHABET) - 2:
            return ALPHABET[(idx + len(ALPHABET)) // 2]
        return prev_rank + "n"

    # 4. Both prev and next are provided
    if prev_rank >= next_rank:
        raise ValueError(f"prev_rank ('{prev_rank}') must be strictly less than next_rank ('{next_rank}')")

    # Handle bucket formatted ranks (e.g., '0|100000:' and '0|200000:')
    if "|" in prev_rank and "|" in next_rank:
        b1, r1 = prev_rank.split("|", 1)
        b2, r2 = next_rank.split("|", 1)
        if b1 == b2:
            r1_c = r1.rstrip(":")
            r2_c = r2.rstrip(":")
            if r1_c.isdigit() and r2_c.isdigit():
                n1, n2 = int(r1_c), int(r2_c)
                if n2 - n1 > 1:
                    return f"{b1}|{(n1 + n2) // 2:06d}:"
                raise RankSpaceExhausted(f"Rank space exhausted between '{prev_rank}' and '{next_rank}'")
            return f"{b1}|{between(r1_c, r2_c)}:"

    # General pure string Lexorank between prev_rank and next_rank
    i = 0
    while i < len(prev_rank) and i < len(next_rank) and prev_rank[i] == next_rank[i]:
        i += 1

    prefix = prev_rank[:i]

    if i < len(prev_rank) and i < len(next_rank):
        # Characters at index i differ
        p_char = prev_rank[i]
        n_char = next_rank[i]
        p_idx = ALPHABET.index(p_char) if p_char in ALPHABET else 0
        n_idx = ALPHABET.index(n_char) if n_char in ALPHABET else len(ALPHABET) - 1

        if n_idx - p_idx > 1:
            # Gap exists between characters
            mid = (p_idx + n_idx) // 2
            return prefix + ALPHABET[mid]
        else:
            # Adjacent characters (e.g. 'a' and 'b')
            # Look at remaining characters in prev_rank
            j = i + 1
            while j < len(prev_rank) and prev_rank[j] == "z":
                j += 1
            if j < len(prev_rank):
                sub_idx = ALPHABET.index(prev_rank[j]) if prev_rank[j] in ALPHABET else 0
                mid = (sub_idx + len(ALPHABET)) // 2
                return prev_rank[:j] + ALPHABET[mid]
            else:
                return prev_rank + "n"

    elif i == len(prev_rank) and i < len(next_rank):
        # prev_rank is a prefix of next_rank (e.g., 'a' and 'an')
        j = i
        while j < len(next_rank) and next_rank[j] == "a":
            j += 1
        if j < len(next_rank):
            n_idx = ALPHABET.index(next_rank[j]) if next_rank[j] in ALPHABET else len(ALPHABET) - 1
            if n_idx > 1:
                mid = n_idx // 2
                return next_rank[:j] + ALPHABET[mid]
            else:
                return next_rank[:j] + "an"
        else:
            return prev_rank + "n"
    else:
        return prev_rank + "n"


def generate_spaced_ranks(count: int, bucket: str = "0", step: int = 100000) -> List[str]:
    """
    Generate evenly spaced ranks for rebalancing or column initialization.
    Guarantees strict lexicographical monotonic ordering for any count.
    Example: ['0|100000:', '0|200000:', '0|300000:', ...]
    """
    if count <= 0:
        return []
    max_val = 999999
    effective_step = step
    if (count + 1) * step > max_val:
        effective_step = max(1, max_val // (count + 1))
    return [f"{bucket}|{(i + 1) * effective_step:06d}:" for i in range(count)]


def needs_rebalance(rank: str, max_length: int = MAX_RANK_LENGTH) -> bool:
    """Return True if the rank exceeds the maximum allowed length (32 chars)."""
    return len(rank) > max_length


async def rebalance_column_cards(db: AsyncSession, column_id: uuid.UUID) -> List[Card]:
    """
    Rebalance all cards in a column by re-spacing their ranks evenly.
    Uses row-level locking (with_for_update) to prevent concurrent rebalance race conditions.
    """
    stmt = (
        select(Card)
        .where(Card.column_id == column_id)
        .order_by(Card.rank.asc())
        .with_for_update()
    )
    res = await db.execute(stmt)
    cards = list(res.scalars().all())

    if not cards:
        return []

    new_ranks = generate_spaced_ranks(len(cards))
    for card, new_rank in zip(cards, new_ranks):
        card.rank = new_rank
        card.version += 1

    await db.commit()
    return cards
