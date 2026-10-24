from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = "sqlite:///./profiles.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    native_language: Mapped[str] = mapped_column(String(80), nullable=False)
    target_language: Mapped[str] = mapped_column(String(80), nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


Base.metadata.create_all(engine)

app = FastAPI(title="Profile and Language API", version="1.0.0")

# For production, replace "*" with the specific extension/app origin or
# deploy the extension and API with a carefully configured security policy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ProfileInput(BaseModel):
    displayName: str = Field(min_length=1, max_length=80)
    nativeLanguage: str = Field(min_length=1, max_length=80)
    targetLanguage: str = Field(min_length=1, max_length=80)
    notes: str = Field(default="", max_length=500)


def serialize(profile: Profile) -> dict:
    return {
        "id": profile.id,
        "displayName": profile.display_name,
        "nativeLanguage": profile.native_language,
        "targetLanguage": profile.target_language,
        "notes": profile.notes,
        "updatedAt": profile.updated_at.isoformat(),
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/profile")
def get_profile():
    """Return the most recently saved profile, if one exists."""
    with SessionLocal() as session:
        profile = session.scalar(select(Profile).order_by(Profile.id.desc()).limit(1))
        return serialize(profile) if profile else {}


@app.post("/api/profile")
def save_profile(payload: ProfileInput):
    name = payload.displayName.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be blank.")

    with SessionLocal() as session:
        # This starter stores one profile for a single-user extension prototype.
        profile = session.scalar(select(Profile).order_by(Profile.id.asc()).limit(1))
        if profile is None:
            profile = Profile(
                display_name=name,
                native_language=payload.nativeLanguage,
                target_language=payload.targetLanguage,
                notes=payload.notes.strip(),
            )
            session.add(profile)
        else:
            profile.display_name = name
            profile.native_language = payload.nativeLanguage
            profile.target_language = payload.targetLanguage
            profile.notes = payload.notes.strip()
            profile.updated_at = datetime.now(timezone.utc)

        session.commit()
        session.refresh(profile)
        return serialize(profile)


@app.get("/api/languages")
def get_languages():
    return {
        "languages": [
            "Arabic", "Chinese", "English", "French", "German",
            "Hindi", "Italian", "Japanese", "Korean", "Portuguese", 
            "Russian", "Spanish", "Yoruba"
        ]
    }
