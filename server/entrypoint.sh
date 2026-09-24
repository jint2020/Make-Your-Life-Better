#!/bin/sh
set -e
# 每次启动先把数据库迁移到最新版本
alembic upgrade head
exec fastapi run app/main.py --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
