import Drawer from '@components/views/Drawer'
import PopupMenu, { MenuRef } from '@components/views/PopupMenu'
import { Ionicons, AntDesign } from '@expo/vector-icons'
import { Theme } from '@lib/theme/ThemeManager'
import { useRouter } from 'expo-router'
import { StyleSheet } from 'react-native'
import { mmkv } from '@lib/storage/MMKV'
import { RescueAPISettings } from '@lib/services/RescueAPI'

const OptionsMenu = () => {
    const router = useRouter()
    const styles = useStyles()

    const setShow = Drawer.useDrawerState((state) => state.setShow)

    const setShowChat = (b: boolean) => {
        setShow(Drawer.ID.CHATLIST, b)
    }

    const rescueAPIEnabled = mmkv.getBoolean(RescueAPISettings.Enabled) ?? false

    const baseOptions: Array<{
        onPress: (m: MenuRef) => void
        label: string
        icon: keyof typeof AntDesign.glyphMap
    }> = [
        {
            onPress: (m: MenuRef) => {
                m.current?.close()
                router.back()
            },
            label: 'Main Menu',
            icon: 'back' as keyof typeof AntDesign.glyphMap,
        },
        {
            onPress: (m: MenuRef) => {
                m.current?.close()
                router.push('/CharacterEditor')
            },
            label: 'Edit Character',
            icon: 'edit' as keyof typeof AntDesign.glyphMap,
        },
        {
            onPress: (m: MenuRef) => {
                setShowChat(true)
                m.current?.close()
            },
            label: 'Chat History',
            icon: 'paperclip' as keyof typeof AntDesign.glyphMap,
        },
    ]

    // Add rescue victims option if enabled
    const options = rescueAPIEnabled 
        ? [...baseOptions, {
            onPress: (m: MenuRef) => {
                m.current?.close()
                router.push('/AppSettingsMenu' as any)
            },
            label: 'Rescue Victims',
            icon: 'profile' as keyof typeof AntDesign.glyphMap,
        }]
        : baseOptions

    return (
        <PopupMenu
            options={options}
            placement="top">
            <Ionicons name="caret-up" style={styles.optionsButton} size={24} />
        </PopupMenu>
    )
}

export default OptionsMenu

const useStyles = () => {
    const { color, spacing, borderWidth } = Theme.useTheme()

    return StyleSheet.create({
        optionsButton: {
            color: color.text._500,
            padding: 4,
            backgroundColor: color.neutral._200,
            borderRadius: 16,
        },
    })
}
