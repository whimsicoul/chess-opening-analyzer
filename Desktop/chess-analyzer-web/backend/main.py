from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import openings, games

load_dotenv()

app = FastAPI(title="Chess Opening Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(openings.router)
app.include_router(games.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
