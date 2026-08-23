"""SQLite-backed domain store — faithful Python port of ``src/agent/query.ts``
+ ``src/agent/crud.ts`` + the expo-sqlite schema bootstrap.

Security note: every SQL identifier (table/column) is whitelisted against the
catalog before being interpolated; only *values* are parameterised. This is the
same discipline the original engine enforces ("no raw SQL from the model").
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from .catalog import ALL_ENTITIES, EntityDef, FieldDef, FieldType, get_entity_def


def _gen_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:14]}"


def _sql_type(field: FieldDef) -> str:
    return "REAL" if field.type == FieldType.NUMBER else "TEXT"


def _col_whitelist(entity: EntityDef) -> set[str]:
    return {f.name for f in entity.fields}


# Per-instance cache so hot query paths never recompute the column allow-list.


@dataclass
class QuerySpec:
    entity: str
    search: Optional[str] = None
    filters: Optional[list[dict[str, Any]]] = None
    sort: Optional[dict[str, str]] = None
    limit: int = 2000
    offset: int = 0
    with_custom_values: bool = True


class SqliteStore:
    def __init__(self, db_path: str = ":memory:", seed: bool = True):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._whitelist_cache: dict[str, set[str]] = {}
        if seed:
            self.bootstrap()

    def close(self) -> None:
        self.conn.close()

    # --- schema --------------------------------------------------------------

    def bootstrap(self) -> None:
        cur = self.conn.cursor()
        cur.execute("PRAGMA foreign_keys = OFF")
        # change_log (lightweight, for audit-style queries)
        cur.execute(
            """CREATE TABLE IF NOT EXISTS change_log (
                id TEXT PRIMARY KEY, ts INTEGER, action TEXT, scope TEXT,
                scope_id TEXT, actor TEXT, tool TEXT, summary TEXT, session_id TEXT
            )"""
        )
        reserved = {"id", "sys_created_at", "sys_updated_at", "sys_extra"}
        for entity in ALL_ENTITIES:
            cols = ["id TEXT PRIMARY KEY", "sys_created_at TEXT", "sys_updated_at TEXT", "sys_extra TEXT"]
            for fld in entity.fields:
                if fld.name in reserved:
                    continue
                cols.append(f"{fld.name} {_sql_type(fld)}")
            cur.execute(f'CREATE TABLE IF NOT EXISTS "{entity.table}" ({", ".join(cols)})')
            cur.execute(f'CREATE TABLE IF NOT EXISTS "{entity.table}" ({", ".join(cols)})')
        # custom fields
        cur.execute(
            """CREATE TABLE IF NOT EXISTS custom_fields (
                id TEXT PRIMARY KEY, entity_type TEXT, label TEXT, value_type TEXT,
                options TEXT, sort_order INTEGER, created_at TEXT)"""
        )
        cur.execute(
            """CREATE TABLE IF NOT EXISTS custom_field_values (
                id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, field_id TEXT,
                value TEXT, created_at TEXT)"""
        )
        self.conn.commit()

    # --- helpers -------------------------------------------------------------

    def _entity(self, key: str) -> EntityDef:
        ent = get_entity_def(key)
        if not ent:
            raise ValueError(f"الكيان غير مدعوم: {key}")
        return ent

    def _q(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        cur = self.conn.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]

    # --- reads ---------------------------------------------------------------

    def query(self, spec: QuerySpec) -> dict[str, Any]:
        entity = self._entity(spec.entity)
        whitelist = self._whitelist(entity)
        where: list[str] = []
        params: list[Any] = []

        for flt in spec.filters or []:
            field = str(flt.get("field", ""))
            if field not in whitelist:
                continue
            op = str(flt.get("op", "eq"))
            value = flt.get("value")
            value2 = flt.get("value2")
            self._build_filter(where, params, field, op, value, value2)

        extra_select = ""
        extra_join = ""
        if entity.names_join:
            extra_select = entity.names_join.select
            extra_join = entity.names_join.join

        if spec.search:
            needle = f"%{spec.search}%"
            searchable = [f.name for f in entity.fields if f.searchable]
            if entity.names_join and entity.names_join.search:
                where.append(entity.names_join.search["sql"])
                for _ in range(entity.names_join.search["paramCount"]):
                    params.append(needle)
            elif searchable:
                parts = [f"{c} LIKE ?" for c in searchable]
                where.append("(" + " OR ".join(parts) + ")")
                params.extend([needle] * len(searchable))

        where_sql = (" WHERE " + " AND ".join(where)) if where else ""
        order_sql = ""
        if spec.sort and spec.sort.get("field") in whitelist:
            direction = "DESC" if str(spec.sort.get("dir", "asc")).lower().startswith("d") else "ASC"
            order_sql = f' ORDER BY "{spec.sort["field"]}" {direction}'

        base = f'FROM "{entity.table}" e{extra_join}'
        total = self._q(f"SELECT COUNT(*) AS c {base}{where_sql}", params)[0]["c"]
        rows = self._q(
            f'SELECT e.*{extra_select} {base}{where_sql}{order_sql} LIMIT ? OFFSET ?',
            params + [spec.limit, spec.offset],
        )
        if entity.custom_field_entities and spec.with_custom_values:
            self._attach_custom_values(entity, rows)
        for r in rows:
            self._unpack_extra(r)
        return {"rows": rows, "total": total, "entity": entity.key}

    def _build_filter(self, where, params, field, op, value, value2) -> None:
        f = field
        if op in ("eq", "neq"):
            where.append(f'"{f}" {"<>" if op == "neq" else "="} ?')
            params.append(value)
        elif op == "contains":
            where.append(f'"{f}" LIKE ?'); params.append(f"%{value}%")
        elif op == "starts_with":
            where.append(f'"{f}" LIKE ?'); params.append(f"{value}%")
        elif op == "ends_with":
            where.append(f'"{f}" LIKE ?'); params.append(f"%{value}")
        elif op in ("gt", "gte", "lt", "lte"):
            sym = {">": "gt", ">=": "gte", "<": "lt", "<=": "lte"}[op]
            where.append(f'"{f}" {sym} ?'); params.append(value)
        elif op == "between":
            where.append(f'"{f}" BETWEEN ? AND ?'); params.extend([value, value2])
        elif op == "in":
            seq = list(value) if isinstance(value, (list, tuple)) else [value]
            ph = ", ".join("?" * len(seq)) if seq else "NULL"
            where.append(f'"{f}" IN ({ph})'); params.extend(seq)
        elif op == "not_in":
            seq = list(value) if isinstance(value, (list, tuple)) else [value]
            ph = ", ".join("?" * len(seq)) if seq else "NULL"
            where.append(f'"{f}" NOT IN ({ph})'); params.extend(seq)
        elif op == "is_empty":
            where.append(f'("{f}" IS NULL OR "{f}" = \'\')')
        elif op == "not_empty":
            where.append(f'("{f}" IS NOT NULL AND "{f}" <> \'\')')

    def get(self, entity_key: str, record_id: str) -> Optional[dict[str, Any]]:
        entity = self._entity(entity_key)
        extra_select = entity.names_join.select if entity.names_join else ""
        extra_join = entity.names_join.join if entity.names_join else ""
        rows = self._q(
            f'SELECT e.*{extra_select} FROM "{entity.table}" e{extra_join} WHERE e.id = ?', (record_id,)
        )
        if not rows:
            return None
        row = rows[0]
        self._unpack_extra(row)
        if entity.custom_field_entities:
            self._attach_custom_values(entity, [row])
        return row

    def _unpack_extra(self, row: dict[str, Any]) -> None:
        extra = row.pop("sys_extra", None)
        row.pop("sys_created_at", None)
        row.pop("sys_updated_at", None)
        if extra:
            try:
                row.update(json.loads(extra))
            except (json.JSONDecodeError, TypeError):
                pass

    def _attach_custom_values(self, entity: EntityDef, rows: list[dict[str, Any]]) -> None:
        ids = [r["id"] for r in rows if r.get("id")]
        if not ids:
            return
        ent_type = "project" if entity.key == "projects" else entity.key.rstrip("s").rstrip("e") if entity.key.endswith("s") else entity.key
        # map key -> entity_type used in custom fields
        etype = {"projects": "project", "blocks": "block", "plots": "plot"}.get(entity.key, entity.key)
        placeholders = ", ".join("?" * len(ids))
        vals = self._q(
            f"SELECT entity_id, field_id, value FROM custom_field_values WHERE entity_type = ? AND entity_id IN ({placeholders})",
            [etype] + ids,
        )
        by_id: dict[str, list[dict]] = {}
        for v in vals:
            by_id.setdefault(v["entity_id"], []).append({"field_id": v["field_id"], "value": v["value"]})
        for r in rows:
            r["custom_values"] = by_id.get(r.get("id"), [])

    # --- writes --------------------------------------------------------------

    def create(self, entity_key: str, data: dict[str, Any]) -> dict[str, Any]:
        entity = self._entity(entity_key)
        whitelist = self._whitelist(entity)
        record_id = str(data.get("id") or _gen_id())
        known = {k: v for k, v in data.items() if k in whitelist}
        extra = {k: v for k, v in data.items() if k not in whitelist and k not in ("id",)}
        now = str(int(time.time() * 1000))
        cols = ["id", "sys_created_at", "sys_updated_at", "sys_extra"] + list(known.keys())
        vals = [record_id, now, now, json.dumps(extra, ensure_ascii=False)] + [known[k] for k in known.keys()]
        placeholders = ", ".join("?" * len(cols))
        col_sql = ", ".join(f'"{c}"' for c in cols)
        self.conn.execute(f'INSERT INTO "{entity.table}" ({col_sql}) VALUES ({placeholders})', vals)
        self._log("create", entity_key, record_id, "agent")
        self.conn.commit()
        return {"id": record_id, "ok": True, "entity": entity_key}

    def update(self, entity_key: str, record_id: str, data: dict[str, Any]) -> dict[str, Any]:
        entity = self._entity(entity_key)
        whitelist = self._whitelist(entity)
        existing = self._q(f'SELECT sys_extra FROM "{entity.table}" WHERE id = ?', (record_id,))
        if not existing:
            raise ValueError("السجل المطلوب غير موجود؛ لم تتم أي كتابة.")
        known = {k: v for k, v in data.items() if k in whitelist}
        extra = json.loads(existing[0].get("sys_extra") or "{}")
        extra.update({k: v for k, v in data.items() if k not in whitelist and k not in ("id",)})
        now = str(int(time.time() * 1000))
        sets = [f'"{k}" = ?' for k in known] + ['"sys_updated_at" = ?', '"sys_extra" = ?']
        params = list(known.values()) + [now, json.dumps(extra, ensure_ascii=False), record_id]
        self.conn.execute(f'UPDATE "{entity.table}" SET {", ".join(sets)} WHERE id = ?', params)
        self._log("update", entity_key, record_id, "agent")
        self.conn.commit()
        return {"id": record_id, "ok": True, "changedFields": list(known.keys())}

    def delete(self, entity_key: str, record_id: str) -> dict[str, Any]:
        entity = self._entity(entity_key)
        # cascade delete for project tree
        if entity_key == "projects":
            blocks = self._q('SELECT id FROM blocks WHERE project_id = ?', (record_id,))
            for b in blocks:
                plots = self._q('SELECT id FROM plots WHERE block_id = ?', (b["id"],))
                for p in plots:
                    self.conn.execute('DELETE FROM plot_payments WHERE plot_id = ?', (p["id"],))
                    self.conn.execute('DELETE FROM custom_field_values WHERE entity_type = ? AND entity_id = ?', ("plot", p["id"]))
                self.conn.execute('DELETE FROM plots WHERE block_id = ?', (b["id"],))
                self.conn.execute('DELETE FROM custom_field_values WHERE entity_type = ? AND entity_id = ?', ("block", b["id"]))
            self.conn.execute('DELETE FROM blocks WHERE project_id = ?', (record_id,))
            self.conn.execute('DELETE FROM custom_field_values WHERE entity_type = ? AND entity_id = ?', ("project", record_id))
        self.conn.execute(f'DELETE FROM "{entity.table}" WHERE id = ?', (record_id,))
        self._log("delete", entity_key, record_id, "agent")
        self.conn.commit()
        return {"id": record_id, "ok": True, "deleted": True}

    def _log(self, action: str, scope: str, scope_id: str, actor: str) -> None:
        try:
            self.conn.execute(
                "INSERT INTO change_log (id, ts, action, scope, scope_id, actor, tool, summary, session_id) VALUES (?,?,?,?,?,?,?,?,?)",
                (_gen_id("cl_"), int(time.time() * 1000), action, scope, scope_id, actor, "agent", f"{action} {scope} {scope_id}", None),
            )
        except Exception:
            pass
