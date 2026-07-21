import asyncio
import json
from collections import deque
from datetime import datetime

import websockets

MESSAGES = deque(maxlen=60)
CONNECTED = set()


async def broadcast(payload):
    message = json.dumps(payload)
    await asyncio.gather(*(client.send(message) for client in list(CONNECTED)))


async def handler(websocket):
    CONNECTED.add(websocket)
    await websocket.send(json.dumps({
        "type": "history",
        "messages": list(MESSAGES)
    }))

    try:
        async for raw in websocket:
            payload = json.loads(raw)
            if payload.get("type") != "message":
                continue

            name = (payload.get("name") or "Televidente").strip()[:18] or "Televidente"
            text = (payload.get("text") or "").strip()[:280]
            if not text:
                continue

            message = {
                "name": name,
                "text": text,
                "time": datetime.now().strftime("%H:%M")
            }
            MESSAGES.append(message)
            await broadcast({"type": "message", "message": message})
    finally:
        CONNECTED.discard(websocket)


async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
