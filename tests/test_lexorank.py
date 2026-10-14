import pytest
from app.services.lexorank import (
    between,
    generate_spaced_ranks,
    needs_rebalance,
    DEFAULT_INITIAL_RANK,
)


def test_lexorank_spec_examples():
    """Verify the exact examples outlined in the project specification."""
    # Inserting between "aaaa" and "aaac" assigns "aaab"
    assert between("aaaa", "aaac") == "aaab"

    # If no gap exists (e.g., between "a" and "b"), append precision: "an"
    assert between("a", "b") == "an"

    # Bucketed midpoints:
    assert between("0|100000:", "0|200000:") == "0|150000:"


def test_lexorank_boundaries():
    """Verify head, tail, and empty column boundary conditions."""
    # 1. Empty column
    initial = between(None, None)
    assert initial == DEFAULT_INITIAL_RANK

    # 2. Insert before first item (head)
    before_m = between(None, "m")
    assert before_m < "m"

    # 3. Insert after last item (tail)
    after_m = between("m", None)
    assert after_m > "m"

    # 4. Bucketed head & tail
    before_bucket = between(None, "0|200000:")
    assert before_bucket < "0|200000:"

    after_bucket = between("0|200000:", None)
    assert after_bucket > "0|200000:"


def test_lexorank_subdivision_monotonic():
    """Verify fractional subdivisions maintain strict monotonic sorting."""
    rank_a = "a"
    rank_b = "b"

    # Insert between 'a' and 'b' -> 'an'
    rank_mid1 = between(rank_a, rank_b)
    assert rank_a < rank_mid1 < rank_b
    assert rank_mid1 == "an"

    # Insert between 'a' and 'an' -> 'ag'
    rank_mid2 = between(rank_a, rank_mid1)
    assert rank_a < rank_mid2 < rank_mid1
    assert rank_mid2 == "ag"

    # Insert between 'an' and 'b' -> 'at'
    rank_mid3 = between(rank_mid1, rank_b)
    assert rank_mid1 < rank_mid3 < rank_b
    assert rank_mid3 == "at"

    # Full ordering check
    ordered_list = [rank_a, rank_mid2, rank_mid1, rank_mid3, rank_b]
    assert ordered_list == sorted(ordered_list)
    assert len(ordered_list) == len(set(ordered_list))


def test_lexorank_repeated_tail_and_head_insertions():
    """Verify inserting repeatedly at tail and head maintains strict ordering."""
    # Repeated tail insertions
    tail_ranks = ["0|100000:"]
    for _ in range(7):
        next_rank = between(tail_ranks[-1], None)
        tail_ranks.append(next_rank)
    assert tail_ranks == sorted(tail_ranks)
    assert len(tail_ranks) == len(set(tail_ranks))

    # Repeated head insertions
    head_ranks = ["0|900000:"]
    for _ in range(5):
        prev_rank = between(None, head_ranks[0])
        head_ranks.insert(0, prev_rank)
    assert head_ranks == sorted(head_ranks)
    assert len(head_ranks) == len(set(head_ranks))


def test_lexorank_invalid_ordering():
    """Verify passing invalid order or identical ranks raises ValueError."""
    with pytest.raises(ValueError):
        between("b", "a")

    with pytest.raises(ValueError):
        between("same", "same")


def test_generate_spaced_ranks():
    """Verify evenly spaced rank generator for rebalancing."""
    ranks = generate_spaced_ranks(4)
    expected = ["0|100000:", "0|200000:", "0|300000:", "0|400000:"]
    assert ranks == expected
    assert ranks == sorted(ranks)

    # Test count >= 10 ensuring lexicographical order is preserved
    ranks_12 = generate_spaced_ranks(12)
    assert len(ranks_12) == 12
    assert ranks_12 == sorted(ranks_12)
    assert len(set(ranks_12)) == 12


def test_rank_space_exhausted():
    from app.services.lexorank import RankSpaceExhausted
    with pytest.raises(RankSpaceExhausted):
        between("0|100000:", "0|100001:")

    with pytest.raises(RankSpaceExhausted):
        between(None, "0|000001:")


def test_needs_rebalance():
    """Verify rank length rebalance detection at 32 characters."""
    short_rank = "0|100000:"
    assert not needs_rebalance(short_rank)

    # 33 character rank
    long_rank = "a" * 33
    assert needs_rebalance(long_rank)

