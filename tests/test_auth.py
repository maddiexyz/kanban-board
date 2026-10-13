import uuid
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient):
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
    assert data["redis"] == "connected"


@pytest.mark.asyncio
async def test_register_and_login_flow(async_client: AsyncClient):
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPassword123!"

    # 1. Register new user
    reg_res = await async_client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == email
    assert "refresh_token" in reg_res.cookies

    # 2. Duplicate registration fails
    dup_res = await async_client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert dup_res.status_code == 400

    # 3. Login with correct credentials
    login_res = await async_client.post(
        "/api/auth/token",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200
    login_data = login_res.json()
    access_token = login_data["access_token"]
    assert access_token is not None

    # 4. Login with invalid password fails
    bad_login = await async_client.post(
        "/api/auth/token",
        json={"email": email, "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401

    # 5. Access protected /me endpoint
    me_res = await async_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email

    # 6. Unauthenticated access fails
    unauth_res = await async_client.get("/api/auth/me")
    assert unauth_res.status_code == 401


@pytest.mark.asyncio
async def test_token_refresh_and_logout(async_client: AsyncClient):
    email = f"refresh_{uuid.uuid4().hex[:8]}@example.com"
    password = "SecurePassword123!"

    # Register
    reg_res = await async_client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert reg_res.status_code == 201
    refresh_cookie = reg_res.cookies.get("refresh_token")
    assert refresh_cookie is not None

    # Refresh token using Cookie header
    refresh_res = await async_client.post(
        "/api/auth/refresh",
        headers={"Cookie": f"refresh_token={refresh_cookie}"},
    )
    assert refresh_res.status_code == 200
    new_token = refresh_res.json()["access_token"]
    assert new_token is not None

    # Logout
    logout_res = await async_client.post(
        "/api/auth/logout",
        headers={
            "Authorization": f"Bearer {new_token}",
            "Cookie": f"refresh_token={refresh_cookie}",
        },
    )
    assert logout_res.status_code == 200
