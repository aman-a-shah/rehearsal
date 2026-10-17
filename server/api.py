from fastapi import FastAPI

app = FastAPI(title="Rehearsal", version="0.2.0")


@app.get("/api/health")
def health():
    return {"status": "initializing", "version": "0.2.0"}
