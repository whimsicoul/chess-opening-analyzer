from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import get_connection

router = APIRouter(prefix="/openings", tags=["openings"])


class OpeningCreate(BaseModel):
    opening_name: str
    eco_code: str
    moves: str


@router.get("/")
def get_openings():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM white_opening ORDER BY id")
            return cur.fetchall()


@router.post("/", status_code=201)
def create_opening(opening: OpeningCreate):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO white_opening (opening_name, eco_code, moves)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (opening.opening_name, opening.eco_code, opening.moves),
            )
            conn.commit()
            return cur.fetchone()


@router.delete("/{opening_id}", status_code=204)
def delete_opening(opening_id: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM white_opening WHERE id = %s RETURNING id",
                (opening_id,),
            )
            conn.commit()
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Opening not found")
