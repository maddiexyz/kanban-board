import uuid
import pytest
from httpx import AsyncClient


async def create_user_and_token(client: AsyncClient, prefix: str) -> tuple[str, str, str]:
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    password = "Password123!"
    reg_res = await client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert reg_res.status_code == 201
    data = reg_res.json()
    return data["access_token"], email, data["user"]["id"]


@pytest.mark.asyncio
async def test_workspace_creation_and_listing(async_client: AsyncClient):
    token, _, _ = await create_user_and_token(async_client, "owner")
    headers = {"Authorization": f"Bearer {token}"}

    # Create new workspace
    create_res = await async_client.post(
        "/api/workspaces",
        json={"name": "Engineering Team"},
        headers=headers,
    )
    assert create_res.status_code == 201
    created_ws = create_res.json()
    assert created_ws["name"] == "Engineering Team"
    assert created_ws["role"] == "owner"

    # List workspaces
    list_res = await async_client.get("/api/workspaces", headers=headers)
    assert list_res.status_code == 200
    workspaces = list_res.json()
    names = [w["name"] for w in workspaces]
    assert "Engineering Team" in names


@pytest.mark.asyncio
async def test_workspace_multi_tenancy_access_guard(async_client: AsyncClient):
    # User A creates a workspace
    token_a, _, _ = await create_user_and_token(async_client, "user_a")
    headers_a = {"Authorization": f"Bearer {token_a}"}

    create_res = await async_client.post(
        "/api/workspaces",
        json={"name": "Confidential Workspace"},
        headers=headers_a,
    )
    workspace_id = create_res.json()["id"]

    # User B tries to access User A's workspace
    token_b, _, _ = await create_user_and_token(async_client, "user_b")
    headers_b = {"Authorization": f"Bearer {token_b}"}

    unauthorized_res = await async_client.get(
        f"/api/workspaces/{workspace_id}",
        headers=headers_b,
    )
    # MUST be rejected by get_current_workspace_user tenancy dependency guard
    assert unauthorized_res.status_code == 403
    assert "not a member" in unauthorized_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_workspace_membership_invitation_and_role_guards(async_client: AsyncClient):
    # User A (Owner) creates workspace
    token_a, email_a, id_a = await create_user_and_token(async_client, "owner_a")
    token_b, email_b, id_b = await create_user_and_token(async_client, "member_b")
    token_c, email_c, id_c = await create_user_and_token(async_client, "member_c")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    headers_c = {"Authorization": f"Bearer {token_c}"}

    create_res = await async_client.post(
        "/api/workspaces",
        json={"name": "Collaboration Hub"},
        headers=headers_a,
    )
    workspace_id = create_res.json()["id"]

    # 1. User A invites User B as 'member'
    invite_res = await async_client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": email_b, "role": "member"},
        headers=headers_a,
    )
    assert invite_res.status_code == 201
    assert invite_res.json()["role"] == "member"

    # 2. Duplicate invite fails
    dup_invite = await async_client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": email_b, "role": "member"},
        headers=headers_a,
    )
    assert dup_invite.status_code == 400

    # 3. User B can now access workspace details
    detail_res = await async_client.get(
        f"/api/workspaces/{workspace_id}",
        headers=headers_b,
    )
    assert detail_res.status_code == 200
    assert detail_res.json()["role"] == "member"
    assert len(detail_res.json()["members"]) == 2

    # 4. User B (regular member) tries to invite User C -> must be denied with 403
    forbidden_invite = await async_client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": email_c, "role": "member"},
        headers=headers_b,
    )
    assert forbidden_invite.status_code == 403

    # 5. User B tries to remove User A (owner) -> denied with 403
    forbidden_remove = await async_client.delete(
        f"/api/workspaces/{workspace_id}/members/{id_a}",
        headers=headers_b,
    )
    assert forbidden_remove.status_code == 403

    # 6. User A (owner) cannot remove owner -> 400 Bad Request
    owner_self_remove = await async_client.delete(
        f"/api/workspaces/{workspace_id}/members/{id_a}",
        headers=headers_a,
    )
    assert owner_self_remove.status_code == 400

    # 7. User A (owner) removes User B -> succeeds
    remove_b = await async_client.delete(
        f"/api/workspaces/{workspace_id}/members/{id_b}",
        headers=headers_a,
    )
    assert remove_b.status_code == 200

    # 8. User B should now be blocked from workspace -> 403
    revoked_access = await async_client.get(
        f"/api/workspaces/{workspace_id}",
        headers=headers_b,
    )
    assert revoked_access.status_code == 403
