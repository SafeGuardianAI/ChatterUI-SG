import ThemedButton from '@components/buttons/ThemedButton'
import Drawer from '@components/views/Drawer'
import HeaderButton from '@components/views/HeaderButton'
import HeaderTitle from '@components/views/HeaderTitle'
import { Characters } from '@lib/state/Characters'
import { Chats } from '@lib/state/Chat'
import ChatInput from '@screens/ChatMenu/ChatInput'
import AvatarViewer from '@screens/ChatMenu/ChatWindow/AvatarViewer'
import ChatWindow from '@screens/ChatMenu/ChatWindow/ChatWindow'
import ChatsDrawer from '@screens/ChatMenu/ChatsDrawer'
import GrammarToggle from '@screens/ChatMenu/GrammarToggle'
import OptionsMenu from '@screens/ChatMenu/OptionsMenu'
import SettingsDrawer from '@screens/SettingsDrawer'
import { useEffect, useState } from 'react'
import { View, KeyboardAvoidingView, Platform, NativeModules, NativeEventEmitter, Text } from 'react-native'
import { Theme } from '@lib/theme/ThemeManager'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useShallow } from 'zustand/react/shallow'

const { BitChatModule } = NativeModules;
const BitChatEvents = BitChatModule ? new NativeEventEmitter(BitChatModule) : null;

const ChatMenu = () => {
    const { spacing } = Theme.useTheme()
    const insets = useSafeAreaInsets()
    const { unloadCharacter, charId } = Characters.useCharacterCard(
        useShallow((state) => ({
            unloadCharacter: state.unloadCard,
            charId: state.id,
        }))
    )

    const { chat, unloadChat, loadChat } = Chats.useChat()

    const { showSettings, showChats } = Drawer.useDrawerState(
        useShallow((state) => ({    
            showSettings: state.values?.[Drawer.ID.SETTINGS],
            showChats: state.values?.[Drawer.ID.CHATLIST],
        }))
    )

    const [peers, setPeers] = useState([]);
    const [meshConnected, setMeshConnected] = useState(false);

    useEffect(() => {
        // Only initialize BitChat if the native module is available
        if (!BitChatModule || !BitChatEvents) {
            console.log("BitChat module not available - mesh functionality disabled");
            return;
        }

        // Start the mesh service when the component mounts
        BitChatModule.startMeshService();
        console.log("BitChat mesh service started.");
        setMeshConnected(true);

        // Add event listeners
        const messageListener = BitChatEvents!.addListener('onMessageReceived', (message) => {
            console.log("New message received:", message);
            // Here you could add the message to your chat state
        });

        const peerListener = BitChatEvents!.addListener('onPeerListUpdated', (peerList) => {
            console.log("Peer list updated:", peerList);
            setPeers(peerList);
        });

        // Clean up on unmount
        return () => {
            console.log("Stopping BitChat mesh service.");
            messageListener.remove();
            peerListener.remove();
            BitChatModule.stopMeshService();
            setMeshConnected(false);
        };
    }, []);


    useEffect(() => {
        return () => {
            unloadCharacter()
            unloadChat()
        }
    }, [])

    const handleCreateChat = async () => {
        if (charId)
            Chats.db.mutate.createChat(charId).then((chatId) => {
                if (chatId) loadChat(chatId)
            })
    }

    const handleBroadcastChat = () => {
        if (!BitChatModule) {
            console.log("BitChat module not available - cannot broadcast");
            return;
        }
        
        if (chat) {
            // Simple serialization of the chat messages.
            // You might want to format this differently.
            const conversationText = chat.messages.map(m => `${m.name}: ${m.swipes[m.swipe_id].swipe}`).join('\\n');
            if (conversationText) {
                console.log("Broadcasting conversation...");
                BitChatModule.sendPublicMessage(conversationText);
            }
        }
    };

    // TODO: This is a fix for gesture vs 3-button nav for android
    const getOffset = () => {
        // assume gesture nav, 54 is arbitrary keyboard nav height
        if (insets.bottom < 30) return insets.bottom + 54
        return insets.bottom
    }

    return (
        <Drawer.Gesture
            config={[
                {
                    drawerID: Drawer.ID.CHATLIST,
                    openDirection: 'left',
                    closeDirection: 'right',
                },
                {
                    drawerID: Drawer.ID.SETTINGS,
                    openDirection: 'right',
                    closeDirection: 'left',
                },
            ]}>
            <View style={{ flex: 1 }}>
                <KeyboardAvoidingView
                    keyboardVerticalOffset={getOffset()}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1, paddingBottom: insets.bottom }}>
                    <HeaderTitle />
                    <HeaderButton
                        headerLeft={() =>
                            !showChats && <Drawer.Button drawerID={Drawer.ID.SETTINGS} />
                        }
                        headerRight={() =>
                            !showSettings && (
                                <>
                                    {!showChats && (
                                        <>
                                            {/* Mesh Status Indicator */}
                                            <View
                                                style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    marginRight: 16,
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 4,
                                                    borderRadius: 12,
                                                    backgroundColor: meshConnected ? 
                                                        (peers.length > 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(249, 115, 22, 0.1)') : 
                                                        'rgba(156, 163, 175, 0.1)',
                                                }}>
                                                <View
                                                    style={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: 4,
                                                        backgroundColor: meshConnected ? 
                                                            (peers.length > 0 ? '#22c55e' : '#f97316') : 
                                                            '#9ca3af',
                                                        marginRight: 6,
                                                    }}
                                                />
                                                <Text
                                                    style={{
                                                        fontSize: 12,
                                                        color: meshConnected ? 
                                                            (peers.length > 0 ? '#16a34a' : '#ea580c') : 
                                                            '#6b7280',
                                                        fontWeight: '600',
                                                    }}>
                                                    {meshConnected ? `${peers.length} peers` : 'offline'}
                                                </Text>
                                            </View>
                                            <ThemedButton
                                                buttonStyle={{
                                                    marginRight: 16,
                                                }}
                                                iconName="wifi"
                                                variant="tertiary"
                                                iconSize={24}
                                                onPress={handleBroadcastChat}
                                            />
                                            <ThemedButton
                                                buttonStyle={{
                                                    marginRight: 16,
                                                }}
                                                iconName="plus"
                                                variant="tertiary"
                                                iconSize={24}
                                                onPress={handleCreateChat}
                                            />
                                        </>
                                    )}
                                    <Drawer.Button
                                        drawerID={Drawer.ID.CHATLIST}
                                        openIcon="message1"
                                    />
                                </>
                            )
                        }
                    />
                    {chat && <ChatWindow />}
                    <View
                        style={{
                            position: 'absolute',
                            bottom: spacing.xl3,
                            right: spacing.l,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: spacing.m,
                        }}>
                        <GrammarToggle />
                        {/* <OptionsMenu /> */}
                    </View>
                </KeyboardAvoidingView>
                {/**Drawer has to be outside of the KeyboardAvoidingView */}
                <View
                    style={{
                        width: '100%',
                        height: '100%',
                        paddingBottom: insets.bottom,
                        position: 'absolute',
                    }}>
                    <SettingsDrawer />
                    <ChatsDrawer />
                </View>
            </View>
        </Drawer.Gesture>
    )
}

export default ChatMenu
