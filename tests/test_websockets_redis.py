import uuid
import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from main import app


def create_user_and_token(client: TestClient, prefix: str) -> tuple[dict, str]:
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    password = "Password123!"
    reg_res = client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return headers, token


def test_websocket_unauthorized_connections():
    """Verify WebSocket rejects missing, invalid, or cross-tenant tokens."""
    client = TestClient(app)
    headers_a, token_a = create_user_and_token(client, "ws_unauth_a")
    headers_b, token_b = create_user_and_token(client, "ws_unauth_b")

    # User A creates board
    ws_a = client.get("/api/workspaces", headers=headers_a).json()[0]["id"]
    board_a = client.post(
        f"/api/workspaces/{ws_a}/boards",
        json={"title": "Private WS Board"},
        headers=headers_a,
    ).json()["id"]

    # 1. Connection without token -> Rejected
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/boards/{board_a}"):
            pass

    # 2. Connection with invalid token -> Rejected
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/boards/{board_a}?token=invalid.jwt.token"):
            pass

    # 3. Cross-tenant access: User B connects to User A's board -> Rejected
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/boards/{board_a}?token={token_b}"):
            pass


def test_websocket_successful_connection_and_heartbeat():
    """Verify authorized connection succeeds, confirms handshake, and handles ping/pong."""
    client = TestClient(app)
    headers, token = create_user_and_token(client, "ws_handshake")

    ws_id = client.get("/api/workspaces", headers=headers).json()[0]["id"]
    board_id = client.post(
        f"/api/workspaces/{ws_id}/boards",
        json={"title": "Handshake Board"},
        headers=headers,
    ).json()["id"]

    with client.websocket_connect(f"/ws/boards/{board_id}?token={token}") as ws:
        # Handshake confirmation
        init_msg = ws.receive_json()
        assert init_msg["type"] == "CONNECTED"
        assert init_msg["payload"]["board_id"] == board_id

        # Heartbeat Ping/Pong
        ws.send_json({"type": "PING"})
        pong = ws.receive_json()
        assert pong["type"] == "PONG"


def test_websocket_realtime_card_lifecycle_broadcast():
    """Verify card create, update, move, and delete broadcast real-time events over Redis."""
    client = TestClient(app)
    headers, token = create_user_and_token(client, "ws_lifecycle")

    ws_id = client.get("/api/workspaces", headers=headers).json()[0]["id"]
    board = client.post(
        f"/api/workspaces/{ws_id}/boards",
        json={"title": "Live Sync Board"},
        headers=headers,
    ).json()
    board_id = board["id"]

    board_detail = client.get(f"/api/boards/{board_id}", headers=headers).json()
    col_todo = board_detail["columns"][0]["id"]
    col_in_prog = board_detail["columns"][1]["id"]

    with client.websocket_connect(f"/ws/boards/{board_id}?token={token}") as ws:
        # Initial connect
        assert ws.receive_json()["type"] == "CONNECTED"

        # 1. CARD_CREATED
        card = client.post(
            f"/api/columns/{col_todo}/cards",
            json={"title": "Collaborative Task", "description": "Realtime description"},
            headers=headers,
        ).json()
        created_event = ws.receive_json()
        assert created_event["type"] == "CARD_CREATED"
        assert created_event["payload"]["card_id"] == card["id"]
        assert created_event["payload"]["title"] == "Collaborative Task"

        # 2. CARD_UPDATED
        client.patch(
            f"/api/cards/{card['id']}",
            json={"title": "Updated Task Title"},
            headers=headers,
        )
        updated_event = ws.receive_json()
        assert updated_event["type"] == "CARD_UPDATED"
        assert updated_event["payload"]["title"] == "Updated Task Title"
        assert updated_event["payload"]["version"] == 2

        # 3. CARD_MOVED
        client.patch(
            f"/api/cards/{card['id']}/move",
            json={"target_column_id": col_in_prog, "version": 2},
            headers=headers,
        )
        moved_event = ws.receive_json()
        assert moved_event["type"] == "CARD_MOVED"
        assert moved_event["payload"]["card_id"] == card["id"]
        assert moved_event["payload"]["source_column_id"] == col_todo
        assert moved_event["payload"]["target_column_id"] == col_in_prog
        assert moved_event["payload"]["version"] == 3

        # 4. CARD_DELETED
        client.delete(f"/api/cards/{card['id']}", headers=headers)
        deleted_event = ws.receive_json()
        assert deleted_event["type"] == "CARD_DELETED"
        assert deleted_event["payload"]["card_id"] == card["id"]


def test_websocket_column_lifecycle_broadcast():
    """Verify column create, update, and delete broadcast real-time events."""
    client = TestClient(app)
    headers, token = create_user_and_token(client, "ws_col")

    ws_id = client.get("/api/workspaces", headers=headers).json()[0]["id"]
    board_id = client.post(
        f"/api/workspaces/{ws_id}/boards",
        json={"title": "Column Sync Board"},
        headers=headers,
    ).json()["id"]

    with client.websocket_connect(f"/ws/boards/{board_id}?token={token}") as ws:
        assert ws.receive_json()["type"] == "CONNECTED"

        # 1. COLUMN_CREATED
        new_col = client.post(
            f"/api/boards/{board_id}/columns",
            json={"title": "Code Review"},
            headers=headers,
        ).json()
        col_created = ws.receive_json()
        assert col_created["type"] == "COLUMN_CREATED"
        assert col_created["payload"]["column_id"] == new_col["id"]
        assert col_created["payload"]["title"] == "Code Review"

        # 2. COLUMN_UPDATED
        client.patch(
            f"/api/columns/{new_col['id']}",
            json={"title": "Peer Review"},
            headers=headers,
        )
        col_updated = ws.receive_json()
        assert col_updated["type"] == "COLUMN_UPDATED"
        assert col_updated["payload"]["title"] == "Peer Review"

        # 3. COLUMN_DELETED
        client.delete(f"/api/columns/{new_col['id']}", headers=headers)
        col_deleted = ws.receive_json()
        assert col_deleted["type"] == "COLUMN_DELETED"
        assert col_deleted["payload"]["column_id"] == new_col["id"]


def test_websocket_multi_client_broadcast():
    """Verify multiple connected clients on the same board all receive real-time broadcasts."""
    client = TestClient(app)
    headers, token = create_user_and_token(client, "ws_multi")

    ws_id = client.get("/api/workspaces", headers=headers).json()[0]["id"]
    board_id = client.post(
        f"/api/workspaces/{ws_id}/boards",
        json={"title": "Multi-Client Board"},
        headers=headers,
    ).json()["id"]
    col_id = client.get(f"/api/boards/{board_id}", headers=headers).json()["columns"][0]["id"]

    # Open two concurrent connections to the same board
    with client.websocket_connect(f"/ws/boards/{board_id}?token={token}") as ws1:
        assert ws1.receive_json()["type"] == "CONNECTED"

        with client.websocket_connect(f"/ws/boards/{board_id}?token={token}") as ws2:
            assert ws2.receive_json()["type"] == "CONNECTED"

            # Create a card via REST API
            card = client.post(
                f"/api/columns/{col_id}/cards",
                json={"title": "Multi Broadcast Task"},
                headers=headers,
            ).json()

            # BOTH clients must receive the CARD_CREATED event!
            msg1 = ws1.receive_json()
            msg2 = ws2.receive_json()

            assert msg1["type"] == "CARD_CREATED"
            assert msg2["type"] == "CARD_CREATED"
            assert msg1["payload"]["card_id"] == card["id"]
            assert msg2["payload"]["card_id"] == card["id"]
