from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """所有表的基类；Alembic 从这里读 metadata。"""
