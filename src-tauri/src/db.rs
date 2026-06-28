// 数据库层（03 阶段）
//
// 设计：
// - Mutex<Connection> 单例：SQLite 单文件 + 进程内单连接，避免并发写冲突
// - schema.sql 用 include_str! 嵌入二进制（编译期保证 schema 与代码同步）
// - 默认值 INSERT OR IGNORE 在 init() 里做（避免前端拿到 null panic）
// - 错误统一用 DbError，前端 invoke 失败时拿到结构化错误

use rusqlite::Connection;
use serde::{Serialize, Serializer};
use std::path::Path;
use std::sync::Mutex;
use thiserror::Error;

const SCHEMA_SQL: &str = include_str!("../sql/schema.sql");

#[derive(Error, Debug)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("lock poisoned")]
    LockPoisoned,
}

// Tauri 2 的 #[tauri::command] 要求 Result<T, E> 中 E: Serialize（IpcResponse trait bound）
// 序列化成 Display 字符串 → 前端 invoke 失败时拿到 Error，message 字段是 #[error(...)] 格式
impl Serialize for DbError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type DbResult<T> = Result<T, DbError>;

/// 全局 DB state。存到 AppHandle.state，让所有 commands 共享同一连接。
pub struct DbState(pub Mutex<Connection>);

impl DbState {
    /// 打开/创建 db 文件 + 执行 schema + 插入默认值
    pub fn init(app_data_dir: &Path) -> DbResult<Self> {
        std::fs::create_dir_all(app_data_dir)?;
        let db_path = app_data_dir.join("water.db");
        let conn = Connection::open(&db_path)?;
        // WAL 模式：读写并发更友好（虽然 MVP 单进程，但习惯好）
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        // 执行 schema（IF NOT EXISTS + INSERT OR IGNORE，全部幂等）
        conn.execute_batch(SCHEMA_SQL)?;
        Ok(DbState(Mutex::new(conn)))
    }

    /// 加锁访问连接。闭包返回 Result，错误自动 wrap 成 DbError。
    pub fn with_lock<F, T>(&self, f: F) -> DbResult<T>
    where
        F: FnOnce(&Connection) -> DbResult<T>,
    {
        let guard = self.0.lock().map_err(|_| DbError::LockPoisoned)?;
        f(&*guard)
    }
}
