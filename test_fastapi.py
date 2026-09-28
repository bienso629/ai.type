from fastapi import FastAPI, Query
import uvicorn
app = FastAPI()
@app.delete("/test")
def test(doc_type: str | None = Query(None)):
    return {"doc_type": doc_type, "type": str(type(doc_type))}
if __name__ == "__main__":
    uvicorn.run(app, port=8999)
