from fastapi import APIRouter, HTTPException
from app.schemas import TopicResponse
from app.services import fetch_topic

router = APIRouter(tags=["topic"])


@router.get("/topic", response_model=TopicResponse)
async def get_topic() -> TopicResponse:
    """Generate a random German speaking topic with A2-level support."""
    try:
        return await fetch_topic()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate topic: {str(exc)}",
        )
