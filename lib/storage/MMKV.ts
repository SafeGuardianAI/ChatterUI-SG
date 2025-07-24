import AsyncStorage from '@react-native-async-storage/async-storage'
import { createJSONStorage, StateStorage } from 'zustand/middleware'
import { useCallback, useState, useEffect } from 'react'

// AsyncStorage-based storage that mimics MMKV API
export const mmkv = {
    getString: async (key: string): Promise<string | undefined> => {
        try {
            const value = await AsyncStorage.getItem(key)
            return value || undefined
        } catch {
            return undefined
        }
    },
    getNumber: async (key: string): Promise<number | undefined> => {
        try {
            const value = await AsyncStorage.getItem(key)
            if (value === null) return undefined
            const parsed = parseFloat(value)
            return isNaN(parsed) ? undefined : parsed
        } catch {
            return undefined
        }
    },
    getBoolean: async (key: string): Promise<boolean | undefined> => {
        try {
            const value = await AsyncStorage.getItem(key)
            if (value === null) return undefined
            return value === 'true'
        } catch {
            return undefined
        }
    },
    set: async (key: string, value: string | number | boolean): Promise<void> => {
        try {
            await AsyncStorage.setItem(key, String(value))
        } catch (error) {
            console.error('Failed to set AsyncStorage value:', error)
        }
    },
    delete: async (key: string): Promise<void> => {
        try {
            await AsyncStorage.removeItem(key)
        } catch (error) {
            console.error('Failed to delete AsyncStorage value:', error)
        }
    },
    clearAll: async (): Promise<void> => {
        try {
            await AsyncStorage.clear()
        } catch (error) {
            console.error('Failed to clear AsyncStorage:', error)
        }
    },
    getAllKeys: async (): Promise<string[]> => {
        try {
            const keys = await AsyncStorage.getAllKeys()
            return [...keys]
        } catch {
            return []
        }
    },
}

// Synchronous versions for compatibility (using cached values)
const syncCache = new Map<string, any>()

// Initialize cache on startup
const initializeCache = async () => {
    try {
        const keys = await AsyncStorage.getAllKeys()
        const items = await AsyncStorage.multiGet(keys)
        items.forEach(([key, value]) => {
            if (value !== null) {
                syncCache.set(key, value)
            }
        })
    } catch (error) {
        console.error('Failed to initialize storage cache:', error)
    }
}

// Call initialization
initializeCache()

// Synchronous API using cache
export const mmkvSync = {
    getString: (key: string): string | undefined => {
        return syncCache.get(key) || undefined
    },
    getNumber: (key: string): number | undefined => {
        const value = syncCache.get(key)
        if (value === undefined) return undefined
        const parsed = parseFloat(value)
        return isNaN(parsed) ? undefined : parsed
    },
    getBoolean: (key: string): boolean | undefined => {
        const value = syncCache.get(key)
        if (value === undefined) return undefined
        return value === 'true'
    },
    set: (key: string, value: string | number | boolean): void => {
        const stringValue = String(value)
        syncCache.set(key, stringValue)
        // Async write in background
        AsyncStorage.setItem(key, stringValue).catch(error => 
            console.error('Failed to persist to AsyncStorage:', error)
        )
    },
    delete: (key: string): void => {
        syncCache.delete(key)
        // Async delete in background
        AsyncStorage.removeItem(key).catch(error => 
            console.error('Failed to delete from AsyncStorage:', error)
        )
    },
    clearAll: (): void => {
        syncCache.clear()
        // Async clear in background
        AsyncStorage.clear().catch(error => 
            console.error('Failed to clear AsyncStorage:', error)
        )
    },
    getAllKeys: (): string[] => {
        return Array.from(syncCache.keys())
    },
}

export const mmkvStorage: StateStorage = {
    setItem: async (name, value) => {
        await AsyncStorage.setItem(name, value)
        syncCache.set(name, value)
    },
    getItem: async (name) => {
        try {
            const value = await AsyncStorage.getItem(name)
            if (value !== null) {
                syncCache.set(name, value)
            }
            return value
        } catch {
            return null
        }
    },
    removeItem: async (name) => {
        await AsyncStorage.removeItem(name)
        syncCache.delete(name)
    },
}

// Custom hooks that use AsyncStorage
export const useMMKVBoolean = (key: string, defaultValue?: boolean): [boolean, (value: boolean) => void] => {
    const [value, setValue] = useState<boolean>(() => {
        const cached = syncCache.get(key)
        if (cached !== undefined) {
            return cached === 'true'
        }
        return defaultValue ?? false
    })

    useEffect(() => {
        // Load initial value from AsyncStorage
        AsyncStorage.getItem(key).then(stored => {
            if (stored !== null) {
                const boolValue = stored === 'true'
                setValue(boolValue)
                syncCache.set(key, stored)
            }
        }).catch(() => {
            // Ignore errors, use default
        })
    }, [key])

    const setter = useCallback((newValue: boolean) => {
        setValue(newValue)
        const stringValue = String(newValue)
        syncCache.set(key, stringValue)
        AsyncStorage.setItem(key, stringValue).catch(error => {
            console.error('Failed to set AsyncStorage boolean:', error)
        })
    }, [key])

    return [value, setter]
}

export const useMMKVNumber = (key: string, defaultValue?: number): [number, (value: number) => void] => {
    const [value, setValue] = useState<number>(() => {
        const cached = syncCache.get(key)
        if (cached !== undefined) {
            const parsed = parseFloat(cached)
            return isNaN(parsed) ? (defaultValue ?? 0) : parsed
        }
        return defaultValue ?? 0
    })

    useEffect(() => {
        // Load initial value from AsyncStorage
        AsyncStorage.getItem(key).then(stored => {
            if (stored !== null) {
                const numValue = parseFloat(stored)
                if (!isNaN(numValue)) {
                    setValue(numValue)
                    syncCache.set(key, stored)
                }
            }
        }).catch(() => {
            // Ignore errors, use default
        })
    }, [key])

    const setter = useCallback((newValue: number) => {
        setValue(newValue)
        const stringValue = String(newValue)
        syncCache.set(key, stringValue)
        AsyncStorage.setItem(key, stringValue).catch(error => {
            console.error('Failed to set AsyncStorage number:', error)
        })
    }, [key])

    return [value, setter]
}

export const useMMKVString = (key: string, defaultValue?: string): [string, (value: string) => void] => {
    const [value, setValue] = useState<string>(() => {
        const cached = syncCache.get(key)
        return cached !== undefined ? cached : (defaultValue ?? '')
    })

    useEffect(() => {
        // Load initial value from AsyncStorage
        AsyncStorage.getItem(key).then(stored => {
            if (stored !== null) {
                setValue(stored)
                syncCache.set(key, stored)
            }
        }).catch(() => {
            // Ignore errors, use default
        })
    }, [key])

    const setter = useCallback((newValue: string) => {
        setValue(newValue)
        syncCache.set(key, newValue)
        AsyncStorage.setItem(key, newValue).catch(error => {
            console.error('Failed to set AsyncStorage string:', error)
        })
    }, [key])

    return [value, setter]
}

export enum PersistStore {
    TagHider = 'tag-hider-storage',
    CharacterSearch = 'storage-character-search',
}

export namespace PersistStore {
    /**
     * Create a persist config object for zustand-persist
     * @param name key from PersistStore enum
     * @param options extra options to merge, e.g. partialize, version overrides
     */
    export function create<T>(
        name: PersistStore,
        options: Partial<{
            partialize: (state: T) => Partial<T>
            version: number
        }> = {}
    ) {
        return {
            name: name,
            storage: createJSONStorage(() => mmkvStorage),
            partialize: options?.partialize ?? ((state: T) => state),
            ...options,
        }
    }
}
