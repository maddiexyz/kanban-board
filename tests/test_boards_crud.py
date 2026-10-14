import uuid
import pytest
from httpx import AsyncClient


async def setup_workspace_and_auth(client: AsyncClient, prefix: str) -> tuple[dict, str]:
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    password = "Password123!"
    reg_res = await client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch default workspace
    ws_res = await client.get("/api/workspaces", headers=headers)
    assert ws_res.status_code == 200
    workspace_id = ws_res.json()[0]["id"]

    return headers, workspace_id


@pytest.mark.asyncio
async def test_board_creation_and_detail(async_client: AsyncClient):
    headers, workspace_id = await setup_workspace_and_auth(async_client, "board_creator")

    # 1. Create board
    create_res = await async_client.post(
        f"/api/workspaces/{workspace_id}/boards",
        json={"title": "Sprint 42 Board"},
        headers=headers,
    )
    assert create_res.status_code == 201
    board_data = create_res.json()
    board_id = board_data["id"]
    assert board_data["title"] == "Sprint 42 Board"

    # 2. Get board detail (should have 3 pre-populated columns: To Do, In Progress, Done)
    detail_res = await async_client.get(
        f"/api/boards/{board_id}",
        headers=headers,
    )
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert len(detail["columns"]) == 3
    titles = [c["title"] for c in detail["columns"]]
    assert titles == ["To Do", "In Progress", "Done"]

    # Verify column ranks are strictly ascending
    col_ranks = [c["rank"] for c in detail["columns"]]
    assert col_ranks == sorted(col_ranks)


@pytest.mark.asyncio
async def test_column_crud_and_ordering(async_client: AsyncClient):
    headers, workspace_id = await setup_workspace_and_auth(async_client, "col_user")

    # Create board
    b_res = await async_client.post(
        f"/api/workspaces/{workspace_id}/boards",
        json={"title": "Custom Columns Board"},
        headers=headers,
    )
    board_id = b_res.json()["id"]

    # Add a 4th column "QA / Review" at tail
    col_res = await async_client.post(
        f"/api/boards/{board_id}/columns",
        json={"title": "QA / Review"},
        headers=headers,
    )
    assert col_res.status_code == 201
    qa_col = col_res.json()
    assert qa_col["title"] == "QA / Review"

    # Verify 4 columns in order
    detail_res = await async_client.get(f"/api/boards/{board_id}", headers=headers)
    cols = detail_res.json()["columns"]
    assert len(cols) == 4
    assert cols[3]["title"] == "QA / Review"


@pytest.mark.asyncio
async def test_card_creation_and_lexorank_placement(async_client: AsyncClient):
    headers, workspace_id = await setup_workspace_and_auth(async_client, "card_user")

    # Create board
    b_res = await async_client.post(
        f"/api/workspaces/{workspace_id}/boards",
        json={"title": "Task Pipeline"},
        headers=headers,
    )
    board_id = b_res.json()["id"]
    detail = (await async_client.get(f"/api/boards/{board_id}", headers=headers)).json()
    todo_col_id = detail["columns"][0]["id"]

    # 1. Create card at end
    c1 = (await async_client.post(
        f"/api/columns/{todo_col_id}/cards",
        json={"title": "Task 1", "position": "end"},
        headers=headers,
    )).json()
    assert c1["version"] == 1

    # 2. Create another card at end
    c2 = (await async_client.post(
        f"/api/columns/{todo_col_id}/cards",
        json={"title": "Task 2", "position": "end"},
        headers=headers,
    )).json()
    assert c1["rank"] < c2["rank"]

    # 3. Create card at start (before Task 1)
    c0 = (await async_client.post(
        f"/api/columns/{todo_col_id}/cards",
        json={"title": "Task 0", "position": "start"},
        headers=headers,
    )).json()
    assert c0["rank"] < c1["rank"] < c2["rank"]

    # 4. Insert card between Task 1 and Task 2
    c_mid = (await async_client.post(
        f"/api/columns/{todo_col_id}/cards",
        json={
            "title": "Task 1.5",
            "prev_rank": c1["rank"],
            "next_rank": c2["rank"],
        },
        headers=headers,
    )).json()
    assert c1["rank"] < c_mid["rank"] < c2["rank"]

    # Verify final sorted order
    b_detail = (await async_client.get(f"/api/boards/{board_id}", headers=headers)).json()
    todo_cards = b_detail["columns"][0]["cards"]
    card_titles = [c["title"] for c in todo_cards]
    assert card_titles == ["Task 0", "Task 1", "Task 1.5", "Task 2"]


@pytest.mark.asyncio
async def test_o1_reorder_operation_isolation(async_client: AsyncClient):
    """
    CRITICAL REQUIREMENT:
    Verify that reordering a card updates ONLY that single card record (O(1) write).
    All other cards in the column must remain strictly untouched!
    """
    headers, workspace_id = await setup_workspace_and_auth(async_client, "o1_tester")

    b_res = await async_client.post(
        f"/api/workspaces/{workspace_id}/boards",
        json={"title": "O(1) Reordering Verification"},
        headers=headers,
    )
    board_id = b_res.json()["id"]
    detail = (await async_client.get(f"/api/boards/{board_id}", headers=headers)).json()
    col_id = detail["columns"][0]["id"]

    # Create 5 cards in column: C1, C2, C3, C4, C5
    cards = []
    for i in range(1, 6):
        res = await async_client.post(
            f"/api/columns/{col_id}/cards",
            json={"title": f"Card {i}", "position": "end"},
            headers=headers,
        )
        cards.append(res.json())

    # Snapshot existing ranks for all 5 cards
    initial_ranks = {c["id"]: c["rank"] for c in cards}

    # Reorder C5 to be between C1 and C2!
    c1 = cards[0]
    c2 = cards[1]
    c5 = cards[4]

    move_res = await async_client.patch(
        f"/api/cards/{c5['id']}/move",
        json={
            "target_column_id": col_id,
            "prev_rank": c1["rank"],
            "next_rank": c2["rank"],
            "version": c5["version"],
        },
        headers=headers,
    )
    assert move_res.status_code == 200
    moved_c5 = move_res.json()
    assert moved_c5["version"] == 2  # incremented
    assert c1["rank"] < moved_c5["rank"] < c2["rank"]

    # Verify O(1) isolation: Fetch all cards from database
    b_updated = (await async_client.get(f"/api/boards/{board_id}", headers=headers)).json()
    updated_cards = b_updated["columns"][0]["cards"]

    # Check that cards C1, C2, C3, C4 have the EXACT same ranks as before!
    for card in updated_cards:
        if card["id"] != c5["id"]:
            assert card["rank"] == initial_ranks[card["id"]], (
                f"Card {card['title']} rank was unexpectedly modified!"
            )

    # Check new column ordering: should be [Card 1, Card 5, Card 2, Card 3, Card 4]
    new_ordering = [c["title"] for c in updated_cards]
    assert new_ordering == ["Card 1", "Card 5", "Card 2", "Card 3", "Card 4"]


@pytest.mark.asyncio
async def test_cross_column_move_and_concurrency_conflict(async_client: AsyncClient):
    headers, workspace_id = await setup_workspace_and_auth(async_client, "cross_col")

    b_res = await async_client.post(
        f"/api/workspaces/{workspace_id}/boards",
        json={"title": "Workflow Board"},
        headers=headers,
    )
    board_id = b_res.json()["id"]
    detail = (await async_client.get(f"/api/boards/{board_id}", headers=headers)).json()
    todo_col = detail["columns"][0]["id"]
    in_prog_col = detail["columns"][1]["id"]

    # Create card in To Do
    card = (await async_client.post(
        f"/api/columns/{todo_col}/cards",
        json={"title": "Bug Fix #101"},
        headers=headers,
    )).json()

    # 1. Optimistic Concurrency Failure: pass outdated version
    conflict_res = await async_client.patch(
        f"/api/cards/{card['id']}/move",
        json={
            "target_column_id": in_prog_col,
            "version": 999,  # Mismatched version
        },
        headers=headers,
    )
    assert conflict_res.status_code == 409
    assert "conflict" in conflict_res.json()["detail"].lower()

    # 2. Successful move to In Progress with correct version
    move_res = await async_client.patch(
        f"/api/cards/{card['id']}/move",
        json={
            "target_column_id": in_prog_col,
            "version": card["version"],
        },
        headers=headers,
    )
    assert move_res.status_code == 200
    moved_card = move_res.json()
    assert moved_card["column_id"] == in_prog_col
    assert moved_card["version"] == card["version"] + 1


@pytest.mark.asyncio
async def test_board_and_card_tenancy_security(async_client: AsyncClient):
    headers_a, ws_a = await setup_workspace_and_auth(async_client, "tenant_a")
    headers_b, ws_b = await setup_workspace_and_auth(async_client, "tenant_b")

    # User A creates board and card
    b_res = await async_client.post(
        f"/api/workspaces/{ws_a}/boards",
        json={"title": "Private Board A"},
        headers=headers_a,
    )
    board_id = b_res.json()["id"]
    detail = (await async_client.get(f"/api/boards/{board_id}", headers=headers_a)).json()
    col_id = detail["columns"][0]["id"]

    card_res = await async_client.post(
        f"/api/columns/{col_id}/cards",
        json={"title": "Classified Item"},
        headers=headers_a,
    )
    card_id = card_res.json()["id"]

    # User B tries to view User A's board -> 403 Forbidden
    forbidden_board = await async_client.get(
        f"/api/boards/{board_id}",
        headers=headers_b,
    )
    assert forbidden_board.status_code == 403

    # User B tries to view User A's card -> 403 Forbidden
    forbidden_card = await async_client.get(
        f"/api/cards/{card_id}",
        headers=headers_b,
    )
    assert forbidden_card.status_code == 403

    # User B tries to move User A's card -> 403 Forbidden
    forbidden_move = await async_client.patch(
        f"/api/cards/{card_id}/move",
        json={"title": "Hacked"},
        headers=headers_b,
    )
    assert forbidden_move.status_code == 403


@pytest.mark.asyncio
async def test_max_ten_columns_limit(async_client: AsyncClient):
    headers, workspace_id = await setup_workspace_and_auth(async_client, "max_col_tester")

    # Board starts with 3 default columns
    b_res = await async_client.post(
        f"/api/workspaces/{workspace_id}/boards",
        json={"title": "Max Columns Board"},
        headers=headers,
    )
    board_id = b_res.json()["id"]

    detail = (await async_client.get(f"/api/boards/{board_id}", headers=headers)).json()
    assert len(detail["columns"]) == 3

    # Add 7 more columns -> total 10 columns
    for i in range(4, 11):
        res = await async_client.post(
            f"/api/boards/{board_id}/columns",
            json={"title": f"Column {i}"},
            headers=headers,
        )
        assert res.status_code == 201

    # Verify board has exactly 10 columns
    detail_10 = (await async_client.get(f"/api/boards/{board_id}", headers=headers)).json()
    assert len(detail_10["columns"]) == 10

    # Attempt to add an 11th column -> must fail with 400
    res_11 = await async_client.post(
        f"/api/boards/{board_id}/columns",
        json={"title": "Column 11 (Overflow)"},
        headers=headers,
    )
    assert res_11.status_code == 400
    assert "maximum of 10 columns" in res_11.json()["detail"].lower()


@pytest.mark.asyncio
async def test_assignee_workspace_membership_guard(async_client: AsyncClient):
    headers_a, ws_a = await setup_workspace_and_auth(async_client, "owner_assignee")
    headers_b, _ = await setup_workspace_and_auth(async_client, "outsider_assignee")

    # Get user B profile to obtain user B's ID
    user_b_id = (await async_client.get("/api/auth/me", headers=headers_b)).json()["id"]

    # User A creates board
    b_res = await async_client.post(
        f"/api/workspaces/{ws_a}/boards",
        json={"title": "Assignment Board"},
        headers=headers_a,
    )
    board = b_res.json()
    detail = (await async_client.get(f"/api/boards/{board['id']}", headers=headers_a)).json()
    col_id = detail["columns"][0]["id"]

    # 1. Attempt to create card with outsider assignee -> 400
    bad_create = await async_client.post(
        f"/api/columns/{col_id}/cards",
        json={"title": "Task", "assignee_id": user_b_id},
        headers=headers_a,
    )
    assert bad_create.status_code == 400
    assert "member of the workspace" in bad_create.json()["detail"].lower()

    # 2. Create card without assignee
    card = (await async_client.post(
        f"/api/columns/{col_id}/cards",
        json={"title": "Valid Task"},
        headers=headers_a,
    )).json()

    # 3. Attempt to update card with outsider assignee -> 400
    bad_update = await async_client.patch(
        f"/api/cards/{card['id']}",
        json={"assignee_id": user_b_id},
        headers=headers_a,
    )
    assert bad_update.status_code == 400
    assert "member of the workspace" in bad_update.json()["detail"].lower()


@pytest.mark.asyncio
async def test_column_delete_and_rebalance_role_guards(async_client: AsyncClient):
    headers_owner, ws_id = await setup_workspace_and_auth(async_client, "ws_owner")
    headers_member, _ = await setup_workspace_and_auth(async_client, "ws_member")

    member_email = (await async_client.get("/api/auth/me", headers=headers_member)).json()["email"]

    # Invite user as a regular 'member'
    await async_client.post(
        f"/api/workspaces/{ws_id}/members",
        json={"email": member_email, "role": "member"},
        headers=headers_owner,
    )

    # Owner creates board
    b_res = await async_client.post(
        f"/api/workspaces/{ws_id}/boards",
        json={"title": "Column Guard Board"},
        headers=headers_owner,
    )
    board_id = b_res.json()["id"]
    detail = (await async_client.get(f"/api/boards/{board_id}", headers=headers_owner)).json()
    target_col = detail["columns"][0]["id"]

    # Regular member tries to delete column -> 403 Forbidden
    del_res = await async_client.delete(
        f"/api/columns/{target_col}",
        headers=headers_member,
    )
    assert del_res.status_code == 403

    # Regular member tries to trigger rebalance -> 403 Forbidden
    reb_res = await async_client.post(
        f"/api/columns/{target_col}/rebalance",
        headers=headers_member,
    )
    assert reb_res.status_code == 403

    # Owner deletes column -> 200 OK
    owner_del = await async_client.delete(
        f"/api/columns/{target_col}",
        headers=headers_owner,
    )
    assert owner_del.status_code == 200


