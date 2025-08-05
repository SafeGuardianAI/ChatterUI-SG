import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStateStorage } from '@lib/storage/SQLiteStorage'
import { Storage } from '@lib/enums/Storage'

export interface RescueAPISettingsState {
    enabled: boolean
    firebaseEnabled: boolean
    mongodbEnabled: boolean
    endpoint: string
    autoReport: boolean
    lastVictimNumber: string
    customGrammarPath: string
}

export interface RescueAPISettingsActions {
    setEnabled: (value: boolean) => void
    setFirebaseEnabled: (value: boolean) => void
    setMongodbEnabled: (value: boolean) => void
    setEndpoint: (value: string) => void
    setAutoReport: (value: boolean) => void
    setLastVictimNumber: (value: string) => void
    setCustomGrammarPath: (value: string) => void
    clearLastVictimNumber: () => void
    clearCustomGrammarPath: () => void
    reset: () => void
}

export type RescueAPISettingsStore = RescueAPISettingsState & RescueAPISettingsActions

const defaultState: RescueAPISettingsState = {
    enabled: false,
    firebaseEnabled: false,
    mongodbEnabled: true,
    endpoint: '',
    autoReport: true,
    lastVictimNumber: '',
    customGrammarPath: '',
}

export const useRescueAPISettings = create<RescueAPISettingsStore>()(
    persist(
        (set, get) => ({
            ...defaultState,

            setEnabled: (value: boolean) => {
                set({ enabled: value })
                
                // Ensure at least one backend is enabled when API is enabled
                if (value) {
                    const state = get()
                    if (!state.firebaseEnabled && !state.mongodbEnabled) {
                        set({ mongodbEnabled: true })
                    }
                }
            },

            setFirebaseEnabled: (value: boolean) => {
                set({ firebaseEnabled: value })
                
                // Disable MongoDB if Firebase is enabled (mutual exclusion)
                if (value) {
                    set({ mongodbEnabled: false })
                } else {
                    // Ensure at least one backend is enabled
                    const state = get()
                    if (!state.mongodbEnabled) {
                        set({ mongodbEnabled: true })
                    }
                }
            },

            setMongodbEnabled: (value: boolean) => {
                set({ mongodbEnabled: value })
                
                // Disable Firebase if MongoDB is enabled (mutual exclusion)
                if (value) {
                    set({ firebaseEnabled: false })
                } else {
                    // Ensure at least one backend is enabled
                    const state = get()
                    if (!state.firebaseEnabled) {
                        set({ firebaseEnabled: true })
                    }
                }
            },

            setEndpoint: (value: string) => set({ endpoint: value }),
            setAutoReport: (value: boolean) => set({ autoReport: value }),
            setLastVictimNumber: (value: string) => set({ lastVictimNumber: value }),
            setCustomGrammarPath: (value: string) => set({ customGrammarPath: value }),
            
            clearLastVictimNumber: () => set({ lastVictimNumber: '' }),
            clearCustomGrammarPath: () => set({ customGrammarPath: '' }),
            
            reset: () => set(defaultState),
        }),
        {
            name: 'rescue-api-settings',
            storage: createJSONStorage(() => sqliteStateStorage),
            version: 1,
        }
    )
)

// Legacy compatibility - export constants that match the old enum structure
export const RescueAPISettings = {
    Enabled: 'rescue_api_enabled',
    FirebaseEnabled: 'rescue_api_firebase_enabled', 
    MongoDBEnabled: 'rescue_api_mongodb_enabled',
    Endpoint: 'rescue_api_endpoint',
    AutoReport: 'rescue_api_auto_report',
    LastVictimNumber: 'rescue_api_last_victim_number',
} as const 