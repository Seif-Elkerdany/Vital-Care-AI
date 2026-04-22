from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from backend_api.STT.schemas import (
    GuidelineDocumentResponse,
    GuidelineListResponse,
    GuidelineUploadResponse,
)

from .dependencies import build_admin_user_dependency
from .schemas import AdminInvitationResponse, CreateAdminInvitationRequest


def build_admin_router(auth_service, invitation_service, rag_service):
    router = APIRouter(prefix="/admin", tags=["admin"])
    admin_user = build_admin_user_dependency(auth_service)

    def require_rag_service():
        if rag_service is None:
            raise HTTPException(status_code=503, detail="RAG service is not available.")
        return rag_service

    @router.post("/invitations", response_model=AdminInvitationResponse)
    async def create_admin_invitation(
        payload: CreateAdminInvitationRequest,
        user=Depends(admin_user),
    ):
        try:
            return invitation_service.create_invitation(
                admin_user_id=user["id"],
                email=payload.email,
                expires_in_hours=payload.expires_in_hours,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/guidelines/upload", response_model=GuidelineUploadResponse)
    async def upload_guideline(
        file: UploadFile = File(...),
        user=Depends(admin_user),
    ):
        rag = require_rag_service()
        try:
            payload = await file.read()
            return rag.publish_guideline(
                payload,
                original_filename=file.filename or "guideline.pdf",
                uploaded_by=user["id"],
                approved_by=user["id"],
                auto_approve=True,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        finally:
            await file.close()

    @router.get("/guidelines", response_model=GuidelineListResponse)
    async def list_guidelines(
        include_deleted: bool = Query(default=False),
        user=Depends(admin_user),
    ):
        del user
        rag = require_rag_service()
        return GuidelineListResponse(
            items=rag.list_documents(include_deleted=include_deleted)
        )

    @router.post("/guidelines/{document_id}/approve", response_model=GuidelineDocumentResponse)
    async def approve_guideline(document_id: str, user=Depends(admin_user)):
        rag = require_rag_service()
        document_catalog = getattr(rag, "document_catalog", None)
        if document_catalog is None:
            raise HTTPException(
                status_code=503,
                detail="Document catalog is not configured.",
            )
        try:
            return rag.decorate_document_record(
                document_catalog.approve_document(
                    document_id=document_id,
                    approved_by=user["id"],
                )
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    return router
