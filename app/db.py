"""Two SQLAlchemy engines: one for the operational (OLTP) database that the
direct sales entry interface writes to, one for the analytical warehouse.
Keeping them separate mirrors the paper's two-store design (section 3.3)."""
from contextlib import contextmanager
from sqlalchemy import create_engine, text
from config import config

ops_engine = create_engine(
    config.sqlalchemy_url(config.OPS_DB),
    pool_pre_ping=True, pool_recycle=1800, future=True,
)
dw_engine = create_engine(
    config.sqlalchemy_url(config.DW_DB),
    pool_pre_ping=True, pool_recycle=1800, future=True,
)


@contextmanager
def ops_conn():
    """Transactional connection to the operational DB (commit on success)."""
    with ops_engine.begin() as conn:
        yield conn


@contextmanager
def dw_conn():
    with dw_engine.begin() as conn:
        yield conn


def q(conn, sql, **params):
    """Run a statement, return list[dict] (or [] for writes)."""
    rows = conn.execute(text(sql), params)
    if rows.returns_rows:
        return [dict(r._mapping) for r in rows]
    return []


def scalar(conn, sql, **params):
    return conn.execute(text(sql), params).scalar()
