from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.workspaces import router as workspaces_router
from app.api.v1.boards import router as boards_router
from app.api.v1.columns import router as columns_router
from app.api.v1.cards import router as cards_router
from app.api.v1.websockets import router as ws_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(workspaces_router)
api_router.include_router(boards_router)
api_router.include_router(columns_router)
api_router.include_router(cards_router)
api_router.include_router(ws_router)
