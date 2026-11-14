from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

import spacy
from functools import lru_cache
from collections import Counter, defaultdict
from fastapi import HTTPException
from pydantic import BaseModel, Field

import requests
import html
from functools import lru_cache

SPACY_MODELS = {
    "english": "en_core_web_sm",
    "en": "en_core_web_sm",

    "spanish": "es_core_news_sm",
    "es": "es_core_news_sm",

    "french": "fr_core_news_sm",
    "fr": "fr_core_news_sm",

    "german": "de_core_news_sm",
    "de": "de_core_news_sm",

    "italian": "it_core_news_sm",
    "it": "it_core_news_sm",

    "portuguese": "pt_core_news_sm",
    "pt": "pt_core_news_sm",

    "chinese": "zh_core_web_sm",
    "zh": "zh_core_web_sm",

    "japanese": "ja_core_news_sm",
    "ja": "ja_core_news_sm",

    "korean": "ko_core_news_sm",
    "ko": "ko_core_news_sm",

    "dutch": "nl_core_news_sm",
    "nl": "nl_core_news_sm",

    "russian": "ru_core_news_sm",
    "ru": "ru_core_news_sm"
}

LANGUAGE_CODES = {
    "english": "en",
    "en": "en",
    "spanish": "es",
    "es": "es",
    "french": "fr",
    "fr": "fr",
    "german": "de",
    "de": "de",
    "italian": "it",
    "it": "it",
    "portuguese": "pt",
    "pt": "pt",
    "chinese": "zh-CN",
    "zh": "zh-CN",
    "japanese": "ja",
    "ja": "ja",
    "korean": "ko",
    "ko": "ko",
    "dutch": "nl",
    "nl": "nl",
    "russian": "ru",
    "ru": "ru"
}

def get_language_code(language):
    normalized = language.lower().strip()
    normalized = normalized.split("-")[0]

    return LANGUAGE_CODES.get(normalized)

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

class VocabularyRequest(BaseModel):
    text: str = Field(min_length=40, max_length=20000)
    language: str = "english"
    target_language: str
    max_results: int = Field(default=20, ge=1, le=100)

class ProfileInput(BaseModel):
    displayName: str = Field(min_length=1, max_length=80)
    nativeLanguage: str = Field(min_length=1, max_length=80)
    targetLanguage: str = Field(min_length=1, max_length=80)
    notes: str = Field(default="", max_length=500)

class PageContentInput(BaseModel):
    url: str
    title: str
    hostname: str = ""
    language: str | None = None
    text: str = Field(min_length=40, max_length=20000)
    extractedAt: str = ""

class PageContent(Base):
    __tablename__ = "page_contents"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )

    url: Mapped[str] = mapped_column(
        Text, nullable=False
    )

    title: Mapped[str] = mapped_column(
        String(500), nullable=False
    )

    text: Mapped[str] = mapped_column(
        Text, nullable=False
    )

    language: Mapped[str] = mapped_column(
        String(80), default=""
    )

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

@app.post("/api/page-content")
def save_page_content(payload: PageContentInput):

    with SessionLocal() as session:

        page = PageContent(
            url=payload.url,
            title=payload.title,
            text=payload.text,
            language=payload.language or ""
        )

        session.add(page)
        session.commit()
        session.refresh(page)

        return {
            "message": "Webpage content saved successfully",
            "id": page.id,
            "title": page.title
        }

@app.get("/api/languages")
def get_languages():
    return {
        "languages": [
            "Arabic", "Chinese", "English", "French", "German",
            "Hindi", "Italian", "Japanese", "Korean", "Portuguese", 
            "Russian", "Spanish", "Yoruba"
        ]
    }

def extract_vocabulary(
    text,
    language="english",
    target_language="spanish",
    max_results=20
):
    nlp = get_language_model(language)
    doc = nlp(text)

    word_counts = Counter()
    word_examples = defaultdict(str)
    word_types = {}

    for token in doc:

        if not token.is_alpha:
            continue

        if token.is_stop:
            continue

        if len(token.text) < 3:
            continue

        if token.pos_ not in ["NOUN", "VERB", "ADJ", "ADV"]:
            continue

        word = token.lemma_.lower()

        word_counts[word] += 1
        word_types[word] = token.pos_

        if not word_examples[word]:
            word_examples[word] = token.sent.text.strip()

    vocabulary = []

    for word, count in word_counts.most_common(max_results):

        translation = translate_word(
            word,
            language,
            target_language
        )

        vocabulary.append({
            "word": word,
            "translation": translation or "Translation unavailable",
            "frequency": count,
            "part_of_speech": word_types[word],
            "example": word_examples[word]
        })

    return vocabulary

@app.post("/api/vocabulary")
def get_vocabulary(payload: VocabularyRequest):

    vocabulary = extract_vocabulary(
        text=payload.text,
        language=payload.language,
        target_language=payload.target_language,
        max_results=payload.max_results
    )

    return {
        "message": "Vocabulary and translations retrieved successfully",
        "source_language": payload.language,
        "target_language": payload.target_language,
        "total_words": len(vocabulary),
        "vocabulary": vocabulary
    }

@app.post("/api/page-content/{page_id}/vocabulary")
def get_saved_page_vocabulary(page_id: int):

    with SessionLocal() as session:

        page = session.get(PageContent, page_id)

        if page is None:
            raise HTTPException(
                status_code=404,
                detail="Webpage not found."
            )

        vocabulary = extract_vocabulary(page.text)

        return {
            "page_id": page.id,
            "page_title": page.title,
            "message": "Vocabulary extracted successfully",
            "total_words": len(vocabulary),
            "vocabulary": vocabulary
        }

@lru_cache(maxsize=20)
def get_language_model(language):

    language = language.lower().strip()

    # Handle language codes such as en-US or es-ES.
    language = language.split("-")[0]

    model_name = SPACY_MODELS.get(language)

    if not model_name:
        raise HTTPException(
            status_code=400,
            detail=f"Language '{language}' is not supported."
        )

    try:
        return spacy.load(model_name)

    except OSError:
        raise HTTPException(
            status_code=500,
            detail=(
                f"The spaCy model {model_name} is not installed. "
                f"Install it using: python -m spacy download {model_name}"
            )
        )

{
    "word": word,
    "frequency": count,
    "part_of_speech": word_types[word],
    "example": word_examples[word]
}

@lru_cache(maxsize=1000)
def translate_word(word, source_language, target_language):

    source_code = get_language_code(source_language)
    target_code = get_language_code(target_language)

    if not source_code or not target_code:
        return None

    if source_code == target_code:
        return word

    url = "https://api.mymemory.translated.net/get"

    try:
        response = requests.get(
            url,
            params={
                "q": word,
                "langpair": f"{source_code}|{target_code}"
            },
            timeout=10
        )

        response.raise_for_status()

        data = response.json()

        translation = data.get(
            "responseData", {}
        ).get("translatedText")

        if translation:
            return html.unescape(translation)

        return None

    except requests.RequestException as error:
        print(f"Translation error for '{word}': {error}")
        return None