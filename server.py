import json
import time
import random
import uuid
from http.server import SimpleHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("PORT", 8000))

# Каталог проверенных машин с фото
CARS_DB = {
    "amgone": {"name": "Mercedes-AMG ONE", "hp": 1063, "price": 300000000},
    "plaid": {"name": "Tesla Model S Plaid", "hp": 1020, "price": 10000000},
    "rx7": {"name": "Mazda RX-7 FD", "hp": 280, "price": 5000000},
    "m3e46": {"name": "BMW M3 E46", "hp": 343, "price": 4500000},
    "vaz2106": {"name": "ВАЗ-2106", "hp": 81, "price": 110000},
    "moskvich412": {"name": "Москвич-412", "hp": 75, "price": 70000}
}

user_state = {
    "v": 3,
    "money": 949500000,
    "cars": [
        {"uid": "car_amg", "id": "amgone", "got": int(time.time() * 1000), "parts": {"turbo": "C", "wheels": "D"}, "fuel": 15},
        {"uid": "car_plaid1", "id": "plaid", "got": int(time.time() * 1000), "parts": {}, "fuel": 15},
        {"uid": "car_plaid2", "id": "plaid", "got": int(time.time() * 1000), "parts": {}, "fuel": 15},
        {"uid": "car_rx7", "id": "rx7", "got": int(time.time() * 1000), "parts": {}, "fuel": 15},
        {"uid": "car_m3", "id": "m3e46", "got": int(time.time() * 1000), "parts": {}, "fuel": 15},
        {"uid": "car_2106", "id": "vaz2106", "got": int(time.time() * 1000), "parts": {"wheels": "D"}, "fuel": 15},
        {"uid": "car_412", "id": "moskvich412", "got": int(time.time() * 1000), "parts": {}, "fuel": 15}
    ],
    "inv": {"turbo:C": 1, "engine:C": 1, "bodykit:D": 1, "brakes:D": 1, "suspension:D": 1, "wheels:D": 1},
    "slots": 13,
    "boughtSlots": 7,
    "discovered": ["amgone", "plaid", "rx7", "m3e46", "vaz2106", "moskvich412"],
    "starterOpened": True,
    "pending": 1200000,
    "pendingTs": int(time.time() * 1000) - 3600000,
    "stats": {"opened": 10, "races": 5, "wins": 5, "plates": 1, "carsSold": 1},
    "level": 3,
    "xp": 250,
    "quest": 6,
    "plates": ["Х757ЕВ|799"],
    "fuel": 15,
    "daily": {"streak": 0, "last": ""},  # Готово к получению дня 1
    "rewardCaseAt": 0,
    "raceOpps": {
        "car_amg": [
            {"diff": "easy", "carId": "m3e46", "name": "Бензин", "hp": 343},
            {"diff": "medium", "carId": "rx7", "name": "Стас_JDM", "hp": 450},
            {"diff": "hard", "carId": "plaid", "name": "Lightning", "hp": 1020}
        ]
    },
    "race": None,
    "raceLog": [],
    "hist": []
}

class GameServer(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        clean_path = self.path.split('?')[0]
        now_ms = int(time.time() * 1000)

        if clean_path.endswith('/state'):
            response = {"state": user_state, "now": now_ms, "admin": True, "maintenance": None, "cont": None}
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            return

        elif '/market' in clean_path:
            lots = [
                {"id": "l1", "seller": "DriftKing", "kind": "car", "car": {"id": "rx7", "hp": 280, "parts": {}, "uid": "mk_rx7"}, "price": 4000000, "ts": now_ms},
                {"id": "l2", "seller": "Lightning", "kind": "part", "slot": "turbo", "t": "C", "price": 500000, "ts": now_ms},
                {"id": "l3", "seller": "Турбо_Вася", "kind": "plate", "plate": "А777АА|777", "price": 15000000, "ts": now_ms}
            ]
            response = {"lots": lots, "now": now_ms}
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
            return

        super().do_GET()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length > 0 else b'{}'
        data = json.loads(body.decode('utf-8')) if body else {}

        now_ms = int(time.time() * 1000)
        result = None
        clean_path = self.path.split('?')[0]

        if clean_path.endswith('/state'):
            response = {"state": user_state, "now": now_ms, "admin": True, "maintenance": None, "cont": None}

        elif clean_path.endswith('/promo'):
            code = data.get("code", "").upper()
            bonus = 1000000000 if code == "LAST" else 10000000
            user_state["money"] += bonus
            result = {"items": [{"kind": "money", "amount": bonus}], "code": code}
            response = {"state": user_state, "result": result, "now": now_ms, "admin": True}

        elif clean_path.endswith('/action'):
            name = data.get("name")
            params = data.get("params", {})

            # 1. ЕЖЕДНЕВНЫЙ БОНУС (ДЕНЬ 1, 2, 3...)
            if name == "daily":
                streak = (user_state["daily"].get("streak", 0) % 7) + 1
                user_state["daily"]["streak"] = streak
                user_state["daily"]["last"] = ""  # Позволяет забирать бонусы один за другим
                reward = 20000 * streak
                user_state["money"] += reward
                result = {"streak": streak, "money": reward, "items": [{"kind": "money", "amount": reward}]}

            # 2. ОТКРЫТИЕ КЕЙСОВ (ПО 1, 3 И 5 ШТУК, МАШИНЫ И ЗАПЧАСТИ)
            elif name == "openCase":
                kind = params.get("kind", "car")
                case_id = params.get("caseId", "rusty")
                count = int(params.get("count", 1))

                # Расчёт стоимости за пачку
                base_cost = 8000000 if case_id == "elite" else 14000 if kind == "part" else 50000
                total_cost = base_cost * count
                user_state["money"] = max(0, user_state["money"] - total_cost)

                items = []
                if kind == "part":
                    # Выдаём детали
                    slots = ["engine", "turbo", "wheels", "brakes", "suspension", "bodykit"]
                    tiers = ["D", "C", "B", "A"]
                    for _ in range(count):
                        slot = random.choice(slots)
                        tier = random.choice(tiers)
                        key = f"{slot}:{tier}"
                        user_state["inv"][key] = user_state["inv"].get(key, 0) + 1
                        items.append({"kind": "part", "slot": slot, "t": tier})
                    result = {"items": items}
                else:
                    # Выдаём машины (только с красивыми фото!)
                    pool = ["amgone", "plaid", "m3e46", "rx7"] if case_id in ["elite", "sport", "c_de"] else ["vaz2106", "moskvich412", "m3e46"]
                    for _ in range(count):
                        car_id = random.choice(pool)
                        uid = uuid.uuid4().hex[:12]
                        is_new = car_id not in user_state["discovered"]
                        if is_new: user_state["discovered"].append(car_id)
                        user_state["cars"].append({"uid": uid, "id": car_id, "got": now_ms, "parts": {}, "fuel": 15})
                        items.append({"id": car_id, "uid": uid, "isNew": is_new})
                    result = {"id": items[0]["id"], "uid": items[0]["uid"], "isNew": items[0]["isNew"], "items": items}

            # 3. Сбор дохода в Гараже
            elif name == "collect":
                user_state["money"] += int(user_state.get("pending", 0))
                user_state["pending"] = 0
                user_state["pendingTs"] = now_ms

            # 4. Кейс наград раз в 4 часа
            elif name == "rewardCase":
                user_state["rewardCaseAt"] = now_ms + (4 * 3600 * 1000)
                reward = 50000
                user_state["money"] += reward
                result = {"items": [{"kind": "money", "amount": reward}], "money": reward}

            # 5. Награда за квест
            elif name == "questClaim":
                reward = 50000
                user_state["money"] += reward
                user_state["quest"] = user_state.get("quest", 0) + 1
                result = {"quest": user_state["quest"], "money": reward}

            # 6. Покупка слотов в гараже
            elif name == "buySlot":
                price = 100000 * (2 ** user_state["boughtSlots"])
                user_state["money"] = max(0, user_state["money"] - price)
                user_state["boughtSlots"] += 1
                user_state["slots"] += 1
                result = {"price": price}

            # 7. Продажа номера (+5 млн ₽)
            elif name in ["sellPlate", "removePlate"]:
                plate = params.get("plate")
                if plate and plate in user_state["plates"]:
                    user_state["plates"].remove(plate)
                elif user_state["plates"]:
                    user_state["plates"].pop()
                user_state["money"] += 5000000
                result = {"sold": True}

            # 8. Открытие кейса номеров
            elif name == "openPlateCase":
                user_state["money"] = max(0, user_state["money"] - 5000)
                letters = ["А", "В", "Е", "К", "М", "Н", "О", "Р", "С", "Т", "У", "Х"]
                plate = f"{random.choice(letters)}{random.randint(100, 999)}{random.choice(letters)}{random.choice(letters)}|799"
                user_state["plates"].append(plate)
                result = {"plate": plate}

            # 9. Продажа машины
            elif name == "sellCar":
                rm_uids = params.get("uids", [])
                sold = sum(CARS_DB.get(c["id"], {}).get("price", 70000) for c in user_state["cars"] if c["uid"] in rm_uids)
                user_state["cars"] = [c for c in user_state["cars"] if c["uid"] not in rm_uids]
                user_state["money"] += sold
                result = {"sold": sold}

            # 10. Гонки
            elif name == "raceStart":
                car_uid = params.get("carUid", user_state["cars"][0]["uid"])
                fee = 750000 if "amg" in car_uid else 1500
                user_state["money"] = max(0, user_state["money"] - fee)
                user_state["fuel"] = max(0, user_state["fuel"] - 1)
                user_state["race"] = {"uid": car_uid, "fee": fee, "at": now_ms}
                result = {"fee": fee}

            elif name == "raceFinish":
                react = params.get("react", 300)
                win = react is not None and react < 450
                my_t = round(random.uniform(8.1, 8.4), 3) if win else round(random.uniform(8.4, 8.8), 3)
                bot_t = round(my_t + random.uniform(0.1, 0.3), 3) if win else round(my_t - random.uniform(0.1, 0.2), 3)
                fee = 750000
                prize = 2500000 if win else 0
                if win: user_state["money"] += (fee + prize)
                user_state["xp"] += 20
                user_state["race"] = None
                result = {
                    "win": win, "dq": False, "prize": prize, "fee": fee,
                    "reaction": react, "myT": my_t, "botT": bot_t,
                    "myV": random.randint(265, 275), "botV": random.randint(255, 265)
                }

            response = {"state": user_state, "result": result, "now": now_ms, "admin": True, "maintenance": None, "cont": None}
        else:
            response = {"error": "not found"}

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

print(f"Сервер клона запущен: http://localhost:{PORT}")
HTTPServer(('localhost', PORT), GameServer).serve_forever()