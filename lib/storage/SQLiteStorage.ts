import { db } from '../../db/db'
import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'

// Settings table for key-value storage
export const settings = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    type: text('type', { enum: ['string', 'number', 'boolean'] }).notNull().default('string'),
    created_at: integer('created_at', { mode: 'number' })
        .$defaultFn(() => Date.now())
        .notNull(),
    updated_at: integer('updated_at', { mode: 'number' })
        .$defaultFn(() => Date.now())
        .notNull()
        .$onUpdateFn(() => Date.now()),
})

// Ensure the settings table exists
const initializeTable = async () => {
    try {
        await db.run(sql`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean')),
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
            )
        `)
    } catch (error) {
        console.error('Failed to initialize settings table:', error)
    }
}

// Initialize on import
initializeTable()

export class SQLiteStorage {
    private static cache = new Map<string, { value: any, type: string }>()

    static async getString(key: string): Promise<string | undefined> {
        try {
            // Check cache first
            const cached = this.cache.get(key)
            if (cached && cached.type === 'string') {
                return cached.value
            }

            const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
            if (result.length > 0 && result[0].type === 'string') {
                const value = result[0].value
                this.cache.set(key, { value, type: 'string' })
                return value
            }
            return undefined
        } catch (error) {
            console.error('Failed to get string from SQLite:', error)
            return undefined
        }
    }

    static async getNumber(key: string): Promise<number | undefined> {
        try {
            // Check cache first
            const cached = this.cache.get(key)
            if (cached && cached.type === 'number') {
                return cached.value
            }

            const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
            if (result.length > 0 && result[0].type === 'number') {
                const value = parseFloat(result[0].value)
                if (!isNaN(value)) {
                    this.cache.set(key, { value, type: 'number' })
                    return value
                }
            }
            return undefined
        } catch (error) {
            console.error('Failed to get number from SQLite:', error)
            return undefined
        }
    }

    static async getBoolean(key: string): Promise<boolean | undefined> {
        try {
            // Check cache first
            const cached = this.cache.get(key)
            if (cached && cached.type === 'boolean') {
                return cached.value
            }

            const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
            if (result.length > 0 && result[0].type === 'boolean') {
                const value = result[0].value === 'true'
                this.cache.set(key, { value, type: 'boolean' })
                return value
            }
            return undefined
        } catch (error) {
            console.error('Failed to get boolean from SQLite:', error)
            return undefined
        }
    }

    static async set(key: string, value: string | number | boolean): Promise<void> {
        try {
            const type = typeof value
            const stringValue = String(value)
            
            await db.insert(settings)
                .values({
                    key,
                    value: stringValue,
                    type: type as 'string' | 'number' | 'boolean',
                })
                .onConflictDoUpdate({
                    target: settings.key,
                    set: {
                        value: stringValue,
                        type: type as 'string' | 'number' | 'boolean',
                        updated_at: Date.now(),
                    }
                })

            // Update cache
            this.cache.set(key, { value, type })
        } catch (error) {
            console.error('Failed to set value in SQLite:', error)
        }
    }

    static async delete(key: string): Promise<void> {
        try {
            await db.delete(settings).where(eq(settings.key, key))
            this.cache.delete(key)
        } catch (error) {
            console.error('Failed to delete from SQLite:', error)
        }
    }

    static async clear(): Promise<void> {
        try {
            await db.delete(settings)
            this.cache.clear()
        } catch (error) {
            console.error('Failed to clear SQLite settings:', error)
        }
    }

    static async getAllKeys(): Promise<string[]> {
        try {
            const result = await db.select({ key: settings.key }).from(settings)
            return result.map(row => row.key)
        } catch (error) {
            console.error('Failed to get all keys from SQLite:', error)
            return []
        }
    }

    // Synchronous API using cache (similar to mmkvSync)
    static getStringSync(key: string): string | undefined {
        const cached = this.cache.get(key)
        if (cached && cached.type === 'string') {
            return cached.value
        }
        return undefined
    }

    static getNumberSync(key: string): number | undefined {
        const cached = this.cache.get(key)
        if (cached && cached.type === 'number') {
            return cached.value
        }
        return undefined
    }

    static getBooleanSync(key: string): boolean | undefined {
        const cached = this.cache.get(key)
        if (cached && cached.type === 'boolean') {
            return cached.value
        }
        return undefined
    }

    static setSync(key: string, value: string | number | boolean): void {
        const type = typeof value
        this.cache.set(key, { value, type })
        
        // Background async write
        this.set(key, value).catch(error => {
            console.error('Background SQLite write failed:', error)
        })
    }

    static deleteSync(key: string): void {
        this.cache.delete(key)
        
        // Background async delete
        this.delete(key).catch(error => {
            console.error('Background SQLite delete failed:', error)
        })
    }

    // Load all settings into cache on app start
    static async loadCache(): Promise<void> {
        try {
            const result = await db.select().from(settings)
            for (const row of result) {
                let value: any = row.value
                if (row.type === 'number') {
                    value = parseFloat(row.value)
                } else if (row.type === 'boolean') {
                    value = row.value === 'true'
                }
                this.cache.set(row.key, { value, type: row.type })
            }
            console.log(`Loaded ${result.length} settings into cache`)
        } catch (error) {
            console.error('Failed to load settings cache:', error)
        }
    }

    static getCacheKeys(): string[] {
        return Array.from(this.cache.keys())
    }
}

// Export a compatible interface that matches MMKV API
export const sqliteStorage = {
    getString: SQLiteStorage.getString.bind(SQLiteStorage),
    getNumber: SQLiteStorage.getNumber.bind(SQLiteStorage),
    getBoolean: SQLiteStorage.getBoolean.bind(SQLiteStorage),
    set: SQLiteStorage.set.bind(SQLiteStorage),
    delete: SQLiteStorage.delete.bind(SQLiteStorage),
    clearAll: SQLiteStorage.clear.bind(SQLiteStorage),
    getAllKeys: SQLiteStorage.getAllKeys.bind(SQLiteStorage),
}

export const sqliteStorageSync = {
    getString: SQLiteStorage.getStringSync.bind(SQLiteStorage),
    getNumber: SQLiteStorage.getNumberSync.bind(SQLiteStorage),
    getBoolean: SQLiteStorage.getBooleanSync.bind(SQLiteStorage),
    set: SQLiteStorage.setSync.bind(SQLiteStorage),
    delete: SQLiteStorage.deleteSync.bind(SQLiteStorage),
    getAllKeys: SQLiteStorage.getCacheKeys.bind(SQLiteStorage),
}

// StateStorage implementation for Zustand
export const sqliteStateStorage = {
    setItem: async (name: string, value: string) => {
        await SQLiteStorage.set(name, value)
    },
    getItem: async (name: string) => {
        const value = await SQLiteStorage.getString(name)
        return value ?? null
    },
    removeItem: async (name: string) => {
        await SQLiteStorage.delete(name)
    },
} 