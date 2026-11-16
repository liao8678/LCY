"""下載台灣彩券官方威力彩歷史開獎號碼，輸出 lottery/data.json。

用法：python3 tools/fetch_power_lottery.py
資料來源：api.taiwanlottery.com（台灣彩券官方網站使用的公開 API）。
"""
import datetime
import json
import time
import urllib.request
from pathlib import Path

API = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/SuperLotto638Result?period&month={month}&pageNum=1&pageSize=50'
OUT = Path(__file__).resolve().parents[1] / 'lottery' / 'data.json'


def months(start, end):
    year, month = start
    while (year, month) <= end:
        yield f'{year}-{month:02d}'
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)


def fetch(month):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(API.format(month=month), timeout=30) as response:
                body = json.load(response)
            if body.get('rtCode') != 0:
                raise RuntimeError(body.get('rtMsg'))
            return (body.get('content') or {}).get('superLotto638Res') or []
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def main():
    today = datetime.date.today()
    draws = {}
    for month in months((2008, 1), (today.year, today.month)):
        for row in fetch(month):
            numbers = row['drawNumberSize']
            first, second = sorted(numbers[:6]), numbers[6]
            assert len(first) == 6 and all(1 <= n <= 38 for n in first) and 1 <= second <= 8, row
            draws[row['period']] = {
                'period': row['period'], 'date': row['lotteryDate'][:10],
                'first': first, 'second': second,
            }
        time.sleep(0.2)
    data = sorted(draws.values(), key=lambda d: (d['date'], d['period']))
    OUT.write_text(json.dumps({
        'source': '台灣彩券官方網站 api.taiwanlottery.com',
        'updated': today.isoformat(), 'draws': data,
    }, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(data)} 期，{data[0]["date"]} ～ {data[-1]["date"]} → {OUT}')


if __name__ == '__main__':
    main()
